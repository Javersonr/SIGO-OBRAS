import React, { useEffect, useState } from "react";
import { sigo, resolveStorageUrl } from "@/api/sigoClient";
import { avisarNoPortal } from "@/lib/portal-funcionario-acesso";
import AcessoPortalCard from "@/components/seguranca/AcessoPortalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Trash2,
  FileText,
  AlertTriangle,
  ClipboardCheck,
  GraduationCap,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Ficha do Funcionário — abre ao clicar no nome na aba Funcionários.
 * Edição dos dados principais + histórico: advertências (CRUD), vistorias
 * (inspeções de ferramental/EPI), cursos (matrículas EAD) e documentos.
 */

const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

const CAMPOS_EDICAO = [
  ["nome_completo", "Nome completo"],
  ["cpf", "CPF"],
  ["telefone", "Telefone"],
  ["email", "E-mail"],
  ["data_admissao", "Data de admissão", "date"],
  ["salario", "Salário (R$)", "number"],
];

const COR_ADVERTENCIA = {
  Verbal: "bg-amber-100 text-amber-700 border-amber-200",
  Escrita: "bg-orange-100 text-orange-700 border-orange-200",
  Suspensão: "bg-red-100 text-red-700 border-red-200",
};

export default function FichaFuncionarioSheet({
  funcionario,
  empresaAtiva,
  user,
  onClose,
  onSalvo,
  onEditarCompleto,
  onAcessoMudou,
}) {
  const [form, setForm] = useState(funcionario || {});
  const [advertencias, setAdvertencias] = useState([]);
  const [vistorias, setVistorias] = useState([]);
  const [cursos, setCursos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [ferramentasPosse, setFerramentasPosse] = useState([]);
  const [ciencias, setCiencias] = useState([]);
  const [novaCiencia, setNovaCiencia] = useState(null); // {tipo, descricao}
  const [carregando, setCarregando] = useState(true);
  const [novaAdv, setNovaAdv] = useState(null); // {data, tipo, motivo}
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setForm(funcionario || {});
    if (funcionario?.id) carregarHistorico(funcionario);
  }, [funcionario?.id]);

  const carregarHistorico = async (f) => {
    setCarregando(true);
    try {
      const [advs, insps, mats, cursosCat, movs, ferrs] = await Promise.all([
        sigo.entities.FuncionarioAdvertencia.filter({
          empresa_id: empresaAtiva.id,
          funcionario_id: f.id,
        }),
        sigo.entities.InspecaoFerramenta.filter({
          empresa_id: empresaAtiva.id,
          funcionario_id: f.id,
        }),
        sigo.entities.TreinamentoMatricula.filter({
          empresa_id: empresaAtiva.id,
          funcionario_id: f.id,
        }),
        sigo.entities.TreinamentoCurso.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.MovimentacaoFerramenta.filter({
          empresa_id: empresaAtiva.id,
          funcionario_id: f.id,
        }),
        sigo.entities.Ferramenta.filter({ empresa_id: empresaAtiva.id, funcionario_id: f.id }),
      ]);
      const cien = await sigo.entities.EntregaCiencia.filter({
        empresa_id: empresaAtiva.id,
        funcionario_id: f.id,
      });
      setCiencias(cien.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")));
      setAdvertencias(advs.sort((a, b) => (b.data || "").localeCompare(a.data || "")));
      setVistorias(
        insps.sort((a, b) => (b.data_inspecao || "").localeCompare(a.data_inspecao || ""))
      );
      setMovimentacoes(
        movs.sort((a, b) => (b.data_movimentacao || "").localeCompare(a.data_movimentacao || ""))
      );
      setFerramentasPosse(ferrs);
      const nomeCurso = new Map(cursosCat.map((c) => [c.id, c.nome]));
      setCursos(
        mats.map((m) => ({ ...m, curso_nome: nomeCurso.get(m.curso_id) || "(curso removido)" }))
      );
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar histórico");
    } finally {
      setCarregando(false);
    }
  };

  const salvarCampo = async (campo, valor) => {
    try {
      await sigo.entities.Funcionario.update(funcionario.id, { [campo]: valor || null });
      onSalvo?.();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e?.message || e));
    }
  };

  const salvarAdvertencia = async () => {
    if (!novaAdv?.tipo || !novaAdv?.motivo?.trim()) {
      toast.error("Informe o tipo e o motivo da advertência");
      return;
    }
    setOcupado(true);
    try {
      let anexo_ref = null;
      if (novaAdv.arquivo) {
        const res = await sigo.integrations.Core.UploadFile({
          file: novaAdv.arquivo,
          bucket: "contratacao",
        });
        anexo_ref = `${res.bucket}/${res.path}`;
      }
      await sigo.entities.FuncionarioAdvertencia.create({
        empresa_id: empresaAtiva.id,
        funcionario_id: funcionario.id,
        data: novaAdv.data || new Date().toISOString().slice(0, 10),
        tipo: novaAdv.tipo,
        motivo: novaAdv.motivo.trim(),
        anexo_ref,
        aplicada_por: user?.full_name || user?.email || null,
      });
      setNovaAdv(null);
      toast.success("Advertência registrada");
      carregarHistorico(funcionario);
    } catch (e) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setOcupado(false);
    }
  };

  const abrirRef = async (ref) => {
    const url = await resolveStorageUrl(ref);
    if (url) window.open(url, "_blank");
  };

  // Cria a entrega e manda o link do portal pro funcionário dar ciência
  const criarCiencia = async (enviarWhats) => {
    if (!novaCiencia?.tipo || !novaCiencia?.descricao?.trim()) {
      toast.error("Informe o tipo e a descrição dos itens entregues");
      return;
    }
    setOcupado(true);
    try {
      await sigo.entities.EntregaCiencia.create({
        empresa_id: empresaAtiva.id,
        funcionario_id: funcionario.id,
        tipo: novaCiencia.tipo,
        descricao: novaCiencia.descricao.trim(),
        criada_por: user?.full_name || user?.email || null,
      });
      setNovaCiencia(null);
      toast.success("Entrega registrada — aguardando ciência do funcionário");
      if (enviarWhats) {
        const r = await avisarNoPortal(
          funcionario,
          "📋 Você recebeu itens da empresa. Entre no Portal do Funcionário e DÊ CIÊNCIA da entrega."
        );
        if (r.via === "evolution") toast.success("📲 Mensagem enviada automaticamente");
        if (!funcionario.telefone) {
          await navigator.clipboard.writeText(r.texto);
          toast.info("Funcionário sem telefone — mensagem copiada para você entregar");
        }
      }
      carregarHistorico(funcionario);
    } catch (e) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setOcupado(false);
    }
  };

  if (!funcionario) return null;

  return (
    <Sheet open={!!funcionario} onOpenChange={(v) => !v && onClose?.()}>
      <SheetContent className="w-full sm:max-w-[96vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {funcionario.nome_completo}
            {funcionario.funcao_nome && <Badge variant="outline">{funcionario.funcao_nome}</Badge>}
            {funcionario.ativo === false && (
              <Badge variant="outline" className="text-red-600 border-red-200">
                inativo
              </Badge>
            )}
            <span className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditarCompleto?.(funcionario)}
              className="mr-6"
            >
              ✏️ Edição completa
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="grid lg:grid-cols-2 gap-6 py-4">
          {/* Dados principais (edição) */}
          <section className="space-y-2">
            <h3 className="font-semibold text-slate-800">Dados</h3>
            <div className="grid grid-cols-2 gap-3">
              {CAMPOS_EDICAO.map(([campo, rotulo, tipo]) => (
                <div key={campo} className={campo === "nome_completo" ? "col-span-2" : ""}>
                  <Label className="text-xs">{rotulo}</Label>
                  <Input
                    type={tipo || "text"}
                    value={form[campo] ?? ""}
                    onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                    onBlur={(e) => salvarCampo(campo, e.target.value)}
                    className="mt-0.5 h-9"
                  />
                </div>
              ))}
            </div>

            <AcessoPortalCard
              funcionario={funcionario}
              empresaAtiva={empresaAtiva}
              onMudou={onAcessoMudou}
            />

            {/* Documentos pessoais */}
            <h3 className="font-semibold text-slate-800 pt-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Documentos (
              {(funcionario.documentos_pessoais || []).length})
            </h3>
            <div className="space-y-1">
              {(funcionario.documentos_pessoais || []).map((d, i) => (
                <button
                  key={i}
                  onClick={() => abrirRef(d.url)}
                  className="block w-full text-left text-sm text-sky-700 hover:underline truncate"
                >
                  {d.nome || d.url}
                </button>
              ))}
              {!(funcionario.documentos_pessoais || []).length && (
                <p className="text-sm text-slate-400">Nenhum documento anexado.</p>
              )}
            </div>
          </section>

          {/* Históricos */}
          <section className="space-y-4">
            {carregando ? (
              <div className="flex items-center gap-2 text-slate-500 py-8">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando histórico...
              </div>
            ) : (
              <>
                {/* Advertências */}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Advertências ({advertencias.length})
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNovaAdv({ data: new Date().toISOString().slice(0, 10) })}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Nova
                    </Button>
                  </div>
                  {novaAdv && (
                    <div className="mt-2 border rounded-lg p-3 space-y-2 bg-slate-50">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="date"
                          value={novaAdv.data || ""}
                          onChange={(e) => setNovaAdv({ ...novaAdv, data: e.target.value })}
                          className="h-9"
                        />
                        <Select
                          value={novaAdv.tipo || ""}
                          onValueChange={(v) => setNovaAdv({ ...novaAdv, tipo: v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {["Verbal", "Escrita", "Suspensão"].map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        placeholder="Motivo"
                        value={novaAdv.motivo || ""}
                        onChange={(e) => setNovaAdv({ ...novaAdv, motivo: e.target.value })}
                        className="h-9"
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500 flex items-center gap-1 cursor-pointer">
                          <Upload className="w-3 h-3" />
                          {novaAdv.arquivo ? novaAdv.arquivo.name : "Anexar documento (opcional)"}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) =>
                              setNovaAdv({ ...novaAdv, arquivo: e.target.files?.[0] })
                            }
                          />
                        </label>
                        <div className="flex-1" />
                        <Button variant="ghost" size="sm" onClick={() => setNovaAdv(null)}>
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={salvarAdvertencia} disabled={ocupado}>
                          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2 space-y-1">
                    {advertencias.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 text-sm bg-white border rounded p-2"
                      >
                        <Badge variant="outline" className={COR_ADVERTENCIA[a.tipo] || ""}>
                          {a.tipo}
                        </Badge>
                        <span className="text-slate-500">{fmtData(a.data)}</span>
                        <span className="flex-1">{a.motivo}</span>
                        {a.anexo_ref && (
                          <button onClick={() => abrirRef(a.anexo_ref)} title="Abrir anexo">
                            <FileText className="w-4 h-4 text-sky-600" />
                          </button>
                        )}
                        <button
                          title="Excluir"
                          onClick={async () => {
                            if (!confirm("Excluir esta advertência?")) return;
                            await sigo.entities.FuncionarioAdvertencia.delete(a.id);
                            carregarHistorico(funcionario);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                        </button>
                      </div>
                    ))}
                    {!advertencias.length && !novaAdv && (
                      <p className="text-sm text-slate-400">Nenhuma advertência registrada. 👏</p>
                    )}
                  </div>
                </div>

                {/* Cursos / treinamentos */}
                <div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" /> Cursos ({cursos.length})
                  </h3>
                  <div className="mt-1 space-y-1">
                    {cursos.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 text-sm bg-white border rounded p-2"
                      >
                        <span className="flex-1">{m.curso_nome}</span>
                        <Badge
                          variant="outline"
                          className={
                            m.status === "concluido"
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : m.status === "em_andamento"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : ""
                          }
                        >
                          {m.status.replace("_", " ")}
                        </Badge>
                        {m.data_conclusao && (
                          <span className="text-xs text-slate-500">
                            {fmtData(m.data_conclusao)}
                            {m.proxima_renovacao ? ` · renova ${fmtData(m.proxima_renovacao)}` : ""}
                          </span>
                        )}
                      </div>
                    ))}
                    {!cursos.length && (
                      <p className="text-sm text-slate-400">Nenhum treinamento na plataforma.</p>
                    )}
                  </div>
                </div>

                {/* Entregas com ciência eletrônica (substitui a biometria) */}
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4" /> Entregas — ciência eletrônica (
                      {ciencias.length})
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNovaCiencia({ tipo: "EPI", descricao: "" })}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Nova entrega
                    </Button>
                  </div>
                  {novaCiencia && (
                    <div className="mt-2 border rounded-lg p-3 space-y-2 bg-slate-50">
                      <div className="grid grid-cols-[140px_1fr] gap-2">
                        <Select
                          value={novaCiencia.tipo}
                          onValueChange={(v) => setNovaCiencia({ ...novaCiencia, tipo: v })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["EPI", "Ferramenta", "Documento"].map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Itens entregues (ex.: capacete classe B, luva isolante 0,5kV...)"
                          value={novaCiencia.descricao}
                          onChange={(e) =>
                            setNovaCiencia({ ...novaCiencia, descricao: e.target.value })
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setNovaCiencia(null)}>
                          Cancelar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => criarCiencia(false)}
                          disabled={ocupado}
                        >
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => criarCiencia(true)}
                          disabled={ocupado}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          Salvar + WhatsApp
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2 space-y-1">
                    {ciencias.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 text-sm bg-white border rounded p-2"
                      >
                        <Badge variant="outline">{c.tipo}</Badge>
                        <span className="flex-1">{c.descricao}</span>
                        {c.status === "confirmada" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                            ✓ ciência em {fmtData(c.confirmada_em)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-700 border-amber-300">
                            aguardando ciência
                          </Badge>
                        )}
                      </div>
                    ))}
                    {!ciencias.length && !novaCiencia && (
                      <p className="text-sm text-slate-400">
                        Nenhuma entrega registrada. A ciência é dada pelo funcionário no portal
                        (vale como assinatura eletrônica — registra quem, quando e de onde).
                      </p>
                    )}
                  </div>
                </div>

                {/* EPIs */}
                <div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Fichas de EPI (
                    {(funcionario.epis_anexos || []).length})
                  </h3>
                  <div className="mt-1 space-y-1">
                    {(funcionario.epis_anexos || []).map((d, i) => (
                      <button
                        key={i}
                        onClick={() => abrirRef(d.url || d.ref)}
                        className="block w-full text-left text-sm text-sky-700 hover:underline truncate"
                      >
                        {d.nome || d.url || d.ref}
                      </button>
                    ))}
                    {!(funcionario.epis_anexos || []).length && (
                      <p className="text-sm text-slate-400">Nenhuma ficha de EPI anexada.</p>
                    )}
                  </div>
                </div>

                {/* Ferramental: em posse + movimentações do estoque */}
                <div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4" /> Ferramentas em posse (
                    {ferramentasPosse.length})
                  </h3>
                  <div className="mt-1 space-y-1">
                    {ferramentasPosse.map((fe) => (
                      <div
                        key={fe.id}
                        className="flex items-center gap-2 text-sm bg-white border rounded p-2"
                      >
                        <span className="flex-1">{fe.nome || fe.descricao || fe.codigo}</span>
                        {fe.codigo && <span className="text-xs text-slate-400">{fe.codigo}</span>}
                      </div>
                    ))}
                    {!ferramentasPosse.length && (
                      <p className="text-sm text-slate-400">Nenhuma ferramenta em posse.</p>
                    )}
                  </div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2 mt-3">
                    <ClipboardCheck className="w-4 h-4" /> Movimentações de ferramentas (
                    {movimentacoes.length})
                  </h3>
                  <div className="mt-1 space-y-1">
                    {movimentacoes.slice(0, 15).map((mv) => (
                      <div
                        key={mv.id}
                        className="flex items-center gap-2 text-sm bg-white border rounded p-2"
                      >
                        <span className="text-slate-500">{fmtData(mv.data_movimentacao)}</span>
                        <Badge variant="outline">{mv.tipo_movimentacao}</Badge>
                        <span className="flex-1 truncate">{mv.ferramenta_nome || "-"}</span>
                        {mv.data_devolucao ? (
                          <span className="text-xs text-emerald-600">
                            devolvida {fmtData(mv.data_devolucao)}
                          </span>
                        ) : mv.data_prevista_devolucao ? (
                          <span className="text-xs text-amber-600">
                            devolver até {fmtData(mv.data_prevista_devolucao)}
                          </span>
                        ) : null}
                      </div>
                    ))}
                    {!movimentacoes.length && (
                      <p className="text-sm text-slate-400">Nenhuma movimentação registrada.</p>
                    )}
                  </div>
                </div>

                {/* Vistorias (inspeções de ferramental/EPI) */}
                <div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4" /> Vistorias de ferramental/EPI (
                    {vistorias.length})
                  </h3>
                  <div className="mt-1 space-y-1">
                    {vistorias.slice(0, 10).map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-2 text-sm bg-white border rounded p-2"
                      >
                        <span className="text-slate-500">{fmtData(v.data_inspecao)}</span>
                        <span className="flex-1">
                          {v.ferramenta_nome || v.checklist_nome || "Inspeção"}
                        </span>
                        {v.status && <Badge variant="outline">{v.status}</Badge>}
                      </div>
                    ))}
                    {!vistorias.length && (
                      <p className="text-sm text-slate-400">Nenhuma vistoria registrada.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
