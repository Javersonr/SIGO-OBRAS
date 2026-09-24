import React, { useEffect, useMemo, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { normalizarTexto } from "@/lib/busca";
import { logoParaPdf, desenharLogo } from "@/lib/pdf-empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Plus,
  Loader2,
  Trash2,
  GraduationCap,
  Link2,
  MessageCircle,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Gestão da plataforma de treinamentos EAD (cursos → aulas YouTube →
 * matrículas). O funcionário assiste pelo Portal do Funcionário (link com
 * token gerado aqui); conclusão exige todas as aulas >=90% assistidas.
 */

// aceita URL completa ou ID puro do YouTube
function extrairYouTubeId(texto) {
  const t = (texto || "").trim();
  const m =
    t.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/) ||
    t.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}

const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

const STATUS_BADGE = {
  pendente: "bg-slate-100 text-slate-600",
  em_andamento: "bg-amber-100 text-amber-700 border-amber-200",
  concluido: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function TreinamentosEadTab({ empresaAtiva }) {
  const [cursos, setCursos] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [matriculas, setMatriculas] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [cursoSel, setCursoSel] = useState(null); // Sheet de edição do curso
  const [showMatricular, setShowMatricular] = useState(false);
  const [matForm, setMatForm] = useState({ curso_id: "", funcionario_ids: [] });
  const [buscaFunc, setBuscaFunc] = useState("");
  const [novaAula, setNovaAula] = useState({ titulo: "", url: "" });

  const recarregar = async () => {
    setCarregando(true);
    try {
      const [cs, as, ms, fs] = await Promise.all([
        sigo.entities.TreinamentoCurso.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.TreinamentoAula.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.TreinamentoMatricula.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.Funcionario.filter({ empresa_id: empresaAtiva.id, ativo: true }),
      ]);
      setCursos(cs);
      setAulas(as.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
      setMatriculas(ms);
      setFuncionarios(fs);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar treinamentos");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (empresaAtiva?.id) recarregar();
  }, [empresaAtiva?.id]);

  const aulasDoCurso = (cursoId) => aulas.filter((a) => a.curso_id === cursoId);
  const funcPorId = useMemo(() => new Map(funcionarios.map((f) => [f.id, f])), [funcionarios]);

  // ------------------------------------------------------------------ cursos
  const salvarCurso = async () => {
    if (!cursoSel?.nome?.trim()) {
      toast.error("Dê um nome ao curso");
      return;
    }
    const dados = {
      empresa_id: empresaAtiva.id,
      nome: cursoSel.nome.trim(),
      codigo: cursoSel.codigo || null,
      descricao: cursoSel.descricao || null,
      validade_meses: cursoSel.validade_meses ? Number(cursoSel.validade_meses) : null,
      carga_horaria_horas: cursoSel.carga_horaria_horas
        ? Number(cursoSel.carga_horaria_horas)
        : null,
      ativo: cursoSel.ativo !== false,
    };
    if (cursoSel.id) {
      await sigo.entities.TreinamentoCurso.update(cursoSel.id, dados);
    } else {
      const novo = await sigo.entities.TreinamentoCurso.create(dados);
      setCursoSel({ ...cursoSel, id: novo.id });
    }
    toast.success("Curso salvo");
    recarregar();
  };

  const adicionarAula = async () => {
    const ytId = extrairYouTubeId(novaAula.url);
    if (!cursoSel?.id) {
      toast.error("Salve o curso antes de adicionar aulas");
      return;
    }
    if (!novaAula.titulo.trim() || !ytId) {
      toast.error("Informe o título e um link válido do YouTube");
      return;
    }
    const ordem = aulasDoCurso(cursoSel.id).length + 1;
    await sigo.entities.TreinamentoAula.create({
      empresa_id: empresaAtiva.id,
      curso_id: cursoSel.id,
      ordem,
      titulo: novaAula.titulo.trim(),
      youtube_id: ytId,
    });
    setNovaAula({ titulo: "", url: "" });
    recarregar();
  };

  const removerAula = async (aula) => {
    if (!confirm(`Remover a aula "${aula.titulo}"?`)) return;
    await sigo.entities.TreinamentoAula.delete(aula.id);
    recarregar();
  };

  // -------------------------------------------------------------- matrículas
  const matricular = async () => {
    if (!matForm.curso_id || matForm.funcionario_ids.length === 0) {
      toast.error("Escolha o curso e ao menos um funcionário");
      return;
    }
    const jaMatriculados = new Set(
      matriculas
        .filter((m) => m.curso_id === matForm.curso_id && m.status !== "concluido")
        .map((m) => m.funcionario_id)
    );
    const novos = matForm.funcionario_ids.filter((id) => !jaMatriculados.has(id));
    for (const fid of novos) {
      await sigo.entities.TreinamentoMatricula.create({
        empresa_id: empresaAtiva.id,
        curso_id: matForm.curso_id,
        funcionario_id: fid,
        status: "pendente",
      });
    }
    toast.success(
      `${novos.length} matrícula(s) criada(s)` +
        (novos.length < matForm.funcionario_ids.length ? " (já matriculados ignorados)" : "")
    );
    setShowMatricular(false);
    setMatForm({ curso_id: "", funcionario_ids: [] });
    recarregar();
  };

  const copiarLink = async (funcionarioId, telefone) => {
    try {
      const { data } = await sigo.functions.invoke("portalFuncionario", {
        acao: "link",
        funcionario_id: funcionarioId,
      });
      if (data?.success === false) throw new Error(data.error);
      const url = `${window.location.origin}${data.url_path}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link do portal copiado! (vale 30 dias)");
      if (telefone) {
        const fone = telefone.replace(/\D/g, "");
        const msg = `🎓 Seus treinamentos estão disponíveis no Portal do Funcionário:\n${url}`;
        window.open(`https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`, "_blank");
      }
    } catch (e) {
      toast.error("Erro ao gerar link: " + (e?.message || e));
    }
  };

  const removerMatricula = async (m) => {
    if (!confirm("Remover esta matrícula?")) return;
    await sigo.entities.TreinamentoMatricula.delete(m.id);
    recarregar();
  };

  // Lista de Presença: uma folha por DIA de treinamento, padrão 10h/dia
  // (curso de 40h = 4 dias; carga restante no último dia).
  const HORAS_DIA = 10;
  const gerarListasPresenca = async (curso) => {
    const carga = Number(curso.carga_horaria_horas) || 0;
    if (!carga) {
      toast.error("Informe a carga horária do curso antes de gerar as listas");
      return;
    }
    const participantes = matriculas
      .filter((m) => m.curso_id === curso.id)
      .map((m) => funcPorId.get(m.funcionario_id))
      .filter(Boolean);
    if (!participantes.length) {
      toast.error("Nenhum funcionário matriculado neste curso");
      return;
    }
    const inicioStr = prompt("Data do 1º dia de treinamento (DD/MM/AAAA):");
    if (!inicioStr) return;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(inicioStr.trim());
    if (!m) {
      toast.error("Data inválida — use DD/MM/AAAA");
      return;
    }
    const instrutor = prompt("Nome do instrutor (opcional):") || "";
    const inicio = new Date(+m[3], +m[2] - 1, +m[1]);
    const dias = Math.ceil(carga / HORAS_DIA);

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const logo = await logoParaPdf(empresa);

    const aulasCurso = aulasDoCurso(curso.id);

    for (let dia = 0; dia < dias; dia++) {
      if (dia > 0) doc.addPage();
      const data = new Date(inicio);
      data.setDate(data.getDate() + dia);
      const horasDoDia = Math.min(HORAS_DIA, carga - dia * HORAS_DIA);
      let y = desenharLogo(doc, logo, 10);
      if (!logo) y = 16;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("LISTA DE PRESENÇA — TREINAMENTO", W / 2, y + 2, { align: "center" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      y += 9;
      doc.text(
        `${empresa?.razao_social || empresa?.nome || ""} — CNPJ ${empresa?.cnpj || "-"}` +
          `${empresa?.endereco ? ` — ${empresa.endereco}` : ""}`,
        15,
        y
      );
      y += 6;
      doc.text(
        `Treinamento: ${curso.nome}${curso.codigo ? ` (${curso.codigo})` : ""} — Carga horária total: ${carga}h — ` +
          `Modalidade: EAD (plataforma própria, com registro eletrônico individual de conclusão)`,
        15,
        y,
        { maxWidth: W - 30 }
      );
      y += 10;
      doc.text(
        `Dia ${dia + 1} de ${dias} — Data: ${data.toLocaleDateString("pt-BR")} — ` +
          `Horário: 07:00 às 12:00 / 13:00 às 18:00 — Carga do dia: ${horasDoDia}h`,
        15,
        y
      );
      y += 6;
      if (aulasCurso.length) {
        const conteudo = "Conteúdo programático: " + aulasCurso.map((a) => a.titulo).join("; ");
        const linhas = doc.splitTextToSize(conteudo, W - 30);
        doc.text(linhas, 15, y);
        y += linhas.length * 4.5 + 3;
      }
      // cabeçalho da tabela
      doc.setFont("helvetica", "bold");
      doc.text("Nº", 15, y);
      doc.text("Nome", 24, y);
      doc.text("CPF", 92, y);
      doc.text("Função", 124, y);
      doc.text("Assinatura", 158, y);
      doc.setFont("helvetica", "normal");
      y += 2.5;
      doc.line(15, y, W - 15, y);
      y += 7;
      participantes.forEach((f, i) => {
        if (y > 262) {
          doc.addPage();
          y = 20;
        }
        doc.text(String(i + 1), 15, y);
        doc.text((f.nome_completo || "").slice(0, 38), 24, y);
        doc.text(f.cpf || "-", 92, y);
        doc.text((f.funcao_nome || "-").slice(0, 20), 124, y, { maxWidth: 32 });
        doc.line(158, y + 1, W - 15, y + 1);
        y += 9;
      });
      y = Math.max(y + 8, 240);
      if (y > 262) {
        doc.addPage();
        y = 40;
      }
      doc.setFontSize(8);
      doc.text(
        "Declaramos que os participantes acima realizaram o conteúdo do dia na modalidade EAD, " +
          "com controle individual de acesso e conclusão registrado eletronicamente na plataforma.",
        15,
        y,
        { maxWidth: W - 30 }
      );
      doc.setFontSize(9);
      y += 14;
      doc.line(15, y, 95, y);
      doc.text(`Instrutor${instrutor ? `: ${instrutor}` : ""}`, 15, y + 5);
      doc.line(115, y, W - 15, y);
      doc.text("Responsável técnico da empresa", 115, y + 5);
    }
    doc.save(
      `Lista_Presenca_${(curso.nome || "curso").replace(/\s+/g, "_")}_${inicioStr.replaceAll("/", "-")}.pdf`
    );
    toast.success(`${dias} folha(s) de presença gerada(s) — ${HORAS_DIA}h/dia`);
  };

  // ------------------------------------------------------------------ UI
  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando treinamentos...
      </div>
    );
  }

  const funcsFiltrados = funcionarios.filter(
    (f) => !buscaFunc || normalizarTexto(f.nome_completo).includes(normalizarTexto(buscaFunc))
  );

  return (
    <div className="space-y-6">
      {/* Cursos */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="w-5 h-5" /> Cursos ({cursos.length})
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setCursoSel({ nome: "", validade_meses: "", ativo: true })}
            className="bg-slate-900 hover:bg-slate-800"
          >
            <Plus className="w-4 h-4 mr-1" /> Novo curso
          </Button>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {cursos.map((c) => {
            const qtdAulas = aulasDoCurso(c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setCursoSel(c)}
                className="text-left rounded-lg border border-slate-200 p-3 hover:border-slate-400 bg-white"
              >
                <p className="font-medium text-slate-800">{c.nome}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {c.codigo ? c.codigo + " · " : ""}
                  {qtdAulas} aula(s)
                  {c.validade_meses ? ` · validade ${c.validade_meses} meses` : ""}
                  {c.ativo === false ? " · INATIVO" : ""}
                </p>
              </button>
            );
          })}
          {cursos.length === 0 && (
            <p className="text-sm text-slate-500 col-span-full py-4">
              Nenhum curso ainda — crie o primeiro e adicione as aulas (vídeos do YouTube não
              listados).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Matrículas */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-5 h-5" /> Matrículas ({matriculas.length})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowMatricular(true)}>
            <Plus className="w-4 h-4 mr-1" /> Matricular funcionários
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3 font-medium">Funcionário</th>
                <th className="py-2 pr-3 font-medium">Curso</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Conclusão</th>
                <th className="py-2 pr-3 font-medium">Próx. renovação</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {matriculas.map((m) => {
                const f = funcPorId.get(m.funcionario_id);
                const curso = cursos.find((c) => c.id === m.curso_id);
                return (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      {f?.nome_completo || "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{curso?.nome || "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className={STATUS_BADGE[m.status] || ""}>
                        {m.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{fmtData(m.data_conclusao)}</td>
                    <td className="py-2 pr-3 text-slate-600">{fmtData(m.proxima_renovacao)}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          title="Copiar link do portal (e enviar por WhatsApp se tiver telefone)"
                          onClick={() => copiarLink(m.funcionario_id, f?.telefone)}
                        >
                          <MessageCircle className="w-4 h-4 text-emerald-600 hover:text-emerald-800" />
                        </button>
                        <button
                          title="Copiar link do portal"
                          onClick={() => copiarLink(m.funcionario_id, null)}
                        >
                          <Link2 className="w-4 h-4 text-slate-500 hover:text-slate-800" />
                        </button>
                        <button title="Remover matrícula" onClick={() => removerMatricula(m)}>
                          <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {matriculas.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    Nenhuma matrícula — matricule funcionários num curso pra liberar o portal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Sheet: curso + aulas */}
      <Sheet open={!!cursoSel} onOpenChange={(v) => !v && setCursoSel(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {cursoSel && (
            <>
              <SheetHeader>
                <SheetTitle>{cursoSel.id ? "Editar curso" : "Novo curso"}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Nome do curso</Label>
                    <Input
                      value={cursoSel.nome || ""}
                      onChange={(e) => setCursoSel({ ...cursoSel, nome: e.target.value })}
                      placeholder="Ex.: NR10 Básico"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Código</Label>
                    <Input
                      value={cursoSel.codigo || ""}
                      onChange={(e) => setCursoSel({ ...cursoSel, codigo: e.target.value })}
                      placeholder="Ex.: TTRP-0011"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Validade (meses)</Label>
                    <Input
                      type="number"
                      value={cursoSel.validade_meses || ""}
                      onChange={(e) => setCursoSel({ ...cursoSel, validade_meses: e.target.value })}
                      placeholder="Ex.: 24"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Carga horária (h)</Label>
                    <Input
                      type="number"
                      value={cursoSel.carga_horaria_horas || ""}
                      onChange={(e) =>
                        setCursoSel({ ...cursoSel, carga_horaria_horas: e.target.value })
                      }
                      placeholder="Ex.: 40"
                      className="mt-0.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Descrição</Label>
                    <Input
                      value={cursoSel.descricao || ""}
                      onChange={(e) => setCursoSel({ ...cursoSel, descricao: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                </div>
                <Button onClick={salvarCurso} className="bg-slate-900 hover:bg-slate-800">
                  Salvar curso
                </Button>

                {cursoSel.id && (
                  <div className="space-y-2 border-t pt-4">
                    <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                      <Video className="w-4 h-4" /> Aulas
                    </h4>
                    {aulasDoCurso(cursoSel.id).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 text-sm bg-slate-50 rounded p-2"
                      >
                        <span className="flex-1">
                          {a.ordem}. {a.titulo}
                        </span>
                        <a
                          href={`https://youtu.be/${a.youtube_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-sky-600 hover:underline"
                        >
                          ver vídeo
                        </a>
                        <button onClick={() => removerAula(a)}>
                          <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                        </button>
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Input
                        placeholder="Título da aula"
                        value={novaAula.titulo}
                        onChange={(e) => setNovaAula({ ...novaAula, titulo: e.target.value })}
                        className="h-9"
                      />
                      <Input
                        placeholder="Link do YouTube (não listado)"
                        value={novaAula.url}
                        onChange={(e) => setNovaAula({ ...novaAula, url: e.target.value })}
                        className="h-9"
                      />
                      <Button size="sm" variant="outline" onClick={adicionarAula}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-slate-400">
                      A duração do vídeo é detectada automaticamente na primeira exibição; a aula
                      conclui com 90% do tempo assistido.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => gerarListasPresenca(cursoSel)}
                      className="mt-2"
                    >
                      <Users className="w-4 h-4 mr-1" /> Listas de Presença (PDF — 10h/dia)
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Sheet: matricular */}
      <Sheet open={showMatricular} onOpenChange={setShowMatricular}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Matricular funcionários</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-xs">Curso</Label>
              <select
                className="mt-0.5 w-full h-9 rounded-md border border-slate-200 px-2 text-sm"
                value={matForm.curso_id}
                onChange={(e) => setMatForm({ ...matForm, curso_id: e.target.value })}
              >
                <option value="">Selecionar...</option>
                {cursos
                  .filter((c) => c.ativo !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Funcionários</Label>
              <Input
                placeholder="Buscar..."
                value={buscaFunc}
                onChange={(e) => setBuscaFunc(e.target.value)}
                className="mt-0.5 h-9"
              />
              <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
                {funcsFiltrados.map((f) => {
                  const marcado = matForm.funcionario_ids.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 text-sm p-2 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() =>
                          setMatForm((prev) => ({
                            ...prev,
                            funcionario_ids: marcado
                              ? prev.funcionario_ids.filter((x) => x !== f.id)
                              : [...prev.funcionario_ids, f.id],
                          }))
                        }
                      />
                      <span className="flex-1">{f.nome_completo}</span>
                      <span className="text-xs text-slate-400">{f.funcao_nome || ""}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <Button onClick={matricular} className="w-full bg-slate-900 hover:bg-slate-800">
              Matricular ({matForm.funcionario_ids.length})
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
