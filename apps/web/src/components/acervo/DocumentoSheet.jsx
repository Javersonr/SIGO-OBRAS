import React, { useEffect, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { refDoUpload, nomeDoArquivo } from "@/lib/anexo-ref";
import AnexoViewer from "@/components/shared/AnexoViewer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Loader2, Plus, Trash2, Upload, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ATIVIDADES,
  CATEGORIAS,
  TIPOS_DOC,
  ehSintese,
  fmtMoeda,
  inteiroOuNull,
  numeroOuNull,
  rotuloDocumento,
  textoOuNull,
} from "./acervo-utils";

export const BUCKET_ACERVO = "certificados";
export const LIMITE_PDF = 25 * 1024 * 1024; // limite do bucket "certificados"
const SEM_PROFISSIONAL = "__nenhum";

let seqChave = 0;
const novaChave = () => `n${++seqChave}`;

const artsParaTexto = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => (typeof x === "string" ? x : x?.art || x?.numero || JSON.stringify(x)))
    .join("\n");

function paraForm(d) {
  return {
    tipo: d?.tipo || "cat",
    numero: d?.numero || "",
    conselho: d?.conselho || "",
    art_numero: d?.art_numero || "",
    art_observacao: d?.art_observacao || "",
    contratante: d?.contratante || "",
    contratante_cnpj: d?.contratante_cnpj || "",
    contrato: d?.contrato || "",
    valor: d?.valor ?? "",
    data_inicio: d?.data_inicio || "",
    data_fim: d?.data_fim || "",
    objeto: d?.objeto || "",
    cidade: d?.cidade || "",
    uf: d?.uf || "",
    situacao: d?.situacao || "concluida",
    com_execucao: d?.com_execucao === true ? "sim" : d?.com_execucao === false ? "nao" : "ni",
    atividades: Array.isArray(d?.atividades) ? d.atividades : [],
    profissional_id: d?.profissional_id || "",
    profissional_nome: d?.profissional_nome || "",
    empresa_executora: d?.empresa_executora || "",
    cobre_arts: artsParaTexto(d?.cobre_arts),
    riscos: d?.riscos || "",
    observacoes: d?.observacoes || "",
    arquivo_ref: d?.arquivo_ref || null,
    ordem: d?.ordem ?? "",
    codigos_crea: (Array.isArray(d?.codigos_crea) ? d.codigos_crea : []).map((c) => ({
      ...c,
      _k: novaChave(),
      codigo: c?.codigo ?? "",
      descricao: c?.descricao ?? "",
      quantidade: c?.quantidade ?? "",
      unidade: c?.unidade ?? "",
    })),
  };
}

function payloadDoc(f) {
  return {
    tipo: f.tipo,
    numero: textoOuNull(f.numero),
    conselho: textoOuNull(f.conselho),
    art_numero: textoOuNull(f.art_numero),
    art_observacao: textoOuNull(f.art_observacao),
    contratante: textoOuNull(f.contratante),
    contratante_cnpj: textoOuNull(f.contratante_cnpj),
    contrato: textoOuNull(f.contrato),
    valor: numeroOuNull(f.valor),
    data_inicio: f.data_inicio || null,
    data_fim: f.data_fim || null,
    objeto: textoOuNull(f.objeto),
    cidade: textoOuNull(f.cidade),
    uf: textoOuNull(f.uf)?.toUpperCase() ?? null,
    situacao: f.situacao,
    com_execucao: f.com_execucao === "sim" ? true : f.com_execucao === "nao" ? false : null,
    atividades: f.atividades,
    profissional_id: f.profissional_id || null,
    profissional_nome: textoOuNull(f.profissional_nome),
    empresa_executora: textoOuNull(f.empresa_executora),
    cobre_arts: String(f.cobre_arts || "")
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    riscos: textoOuNull(f.riscos),
    observacoes: textoOuNull(f.observacoes),
    arquivo_ref: f.arquivo_ref || null,
    ordem: inteiroOuNull(f.ordem),
    // campos extras do jsonb (se houver) são preservados pelo spread
    codigos_crea: f.codigos_crea
      .filter((c) => textoOuNull(c.codigo) || textoOuNull(c.descricao))
      .map(({ _k, ...c }) => ({
        ...c,
        codigo: textoOuNull(c.codigo),
        descricao: textoOuNull(c.descricao),
        quantidade: numeroOuNull(c.quantidade),
        unidade: textoOuNull(c.unidade),
      })),
  };
}

function quantParaForm(q) {
  return {
    _k: q.id || novaChave(),
    id: q.id,
    categoria: q.categoria || "outro",
    descricao: q.descricao || "",
    quantidade: q.quantidade ?? "",
    unidade: q.unidade || "",
    especificacao: q.especificacao || "",
    na_atividade_tecnica: !!q.na_atividade_tecnica,
    sintese: ehSintese(q),
    observacao: q.observacao || "",
    ordem: q.ordem ?? null,
  };
}

function quantPayload(r) {
  // observacao guarda a marca "síntese" (conta nos totais) ou "detalhe"
  const tinhaSintese = ehSintese(r);
  let observacao = r.observacao || null;
  if (r.sintese && !tinhaSintese) observacao = "síntese";
  if (!r.sintese && (tinhaSintese || !observacao)) observacao = "detalhe";
  return {
    categoria: r.categoria || "outro",
    descricao: String(r.descricao || "").trim(),
    quantidade: numeroOuNull(r.quantidade),
    unidade: textoOuNull(r.unidade),
    especificacao: textoOuNull(r.especificacao),
    na_atividade_tecnica: !!r.na_atividade_tecnica,
    observacao,
  };
}

const quantVazia = (r) =>
  !String(r.descricao || "").trim() && String(r.quantidade ?? "") === "" && !r.especificacao;

/** Só as chaves que mudaram (update parcial não mexe no resto). */
function diffCampos(novo, antigo) {
  const out = {};
  for (const k of Object.keys(novo)) {
    if (JSON.stringify(novo[k]) !== JSON.stringify(antigo[k])) out[k] = novo[k];
  }
  return out;
}

async function emLotes(tarefas, tamanho = 6) {
  for (let i = 0; i < tarefas.length; i += tamanho) {
    await Promise.all(tarefas.slice(i, i + tamanho).map((t) => t()));
  }
}

function Secao({ titulo, children, className }) {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-700">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function CampoForm({ label, children, className }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

/**
 * Criar/editar um documento do acervo (CAT, atestado, CAO, CAT profissional)
 * com códigos CREA e quantitativos. Grava só o que mudou.
 */
export default function DocumentoSheet({
  open,
  onOpenChange,
  documento,
  quantitativos = [],
  profissionais = [],
  empresaId,
  onSalvo,
}) {
  const [form, setForm] = useState(() => paraForm(documento));
  const [linhas, setLinhas] = useState(() => quantitativos.map(quantParaForm));
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verPdf, setVerPdf] = useState(false);
  const inputPdf = useRef(null);

  // (re)carrega o formulário a cada abertura
  useEffect(() => {
    if (!open) return;
    setForm(paraForm(documento));
    setLinhas(quantitativos.map(quantParaForm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documento?.id]);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const alternarAtividade = (id) =>
    setForm((f) => ({
      ...f,
      atividades: f.atividades.includes(id)
        ? f.atividades.filter((a) => a !== id)
        : [...f.atividades, id],
    }));

  const setCodigo = (k, campo, valor) =>
    setForm((f) => ({
      ...f,
      codigos_crea: f.codigos_crea.map((c) => (c._k === k ? { ...c, [campo]: valor } : c)),
    }));

  const setLinha = (k, campo, valor) =>
    setLinhas((ls) => ls.map((l) => (l._k === k ? { ...l, [campo]: valor } : l)));

  const novaLinha = () =>
    setLinhas((ls) => [
      ...ls,
      quantParaForm({ categoria: "outro", observacao: "detalhe", quantidade: "" }),
    ]);

  const escolherCategoria = (k, categoria) =>
    setLinhas((ls) =>
      ls.map((l) => {
        if (l._k !== k) return l;
        const un = CATEGORIAS.find((c) => c.id === categoria)?.unidade;
        return { ...l, categoria, unidade: l.unidade || un || "" };
      })
    );

  const enviarPdf = async (file) => {
    if (!file) return;
    if (file.size > LIMITE_PDF) {
      toast.error("Arquivo acima de 25 MB");
      return;
    }
    setEnviando(true);
    try {
      // grava a referência "bucket/path" (a URL assinada expira em 1h)
      const ref = refDoUpload(
        await sigo.integrations.Core.UploadFile({ file, bucket: BUCKET_ACERVO })
      );
      if (!ref) throw new Error("Upload sem referência");
      set("arquivo_ref", ref);
      toast.success("Arquivo anexado — salve para gravar");
    } catch (e) {
      console.error("[Acervo] upload:", e);
      toast.error("Erro ao enviar o arquivo" + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setEnviando(false);
      if (inputPdf.current) inputPdf.current.value = "";
    }
  };

  const salvar = async () => {
    if (!empresaId) return;
    if (!textoOuNull(form.numero) && !textoOuNull(form.contratante) && !textoOuNull(form.objeto)) {
      toast.error("Informe ao menos o número, o contratante ou o objeto");
      return;
    }
    if (form.valor !== "" && numeroOuNull(form.valor) === null) {
      toast.error("Valor do contrato inválido");
      return;
    }
    const semDescricao = linhas.find((l) => !quantVazia(l) && !String(l.descricao).trim());
    if (semDescricao) {
      toast.error("Há quantitativo sem descrição");
      return;
    }
    setSalvando(true);
    try {
      const payload = payloadDoc(form);
      let doc = documento;
      if (documento?.id) {
        const mudou = diffCampos(payload, payloadDoc(paraForm(documento)));
        if (Object.keys(mudou).length) {
          doc = await sigo.entities.AcervoAtestado.update(documento.id, mudou);
        }
      } else {
        doc = await sigo.entities.AcervoAtestado.create({ ...payload, empresa_id: empresaId });
      }

      // quantitativos: atualiza os alterados, cria os novos, exclui os removidos
      const originais = new Map(quantitativos.map((q) => [q.id, q]));
      let proxOrdem = quantitativos.reduce((m, q) => Math.max(m, Number(q.ordem) || 0), 0) + 1;
      const tarefas = [];
      const mantidos = new Set();
      for (const l of linhas) {
        if (quantVazia(l)) continue;
        const p = quantPayload(l);
        if (l.id && originais.has(l.id)) {
          mantidos.add(l.id);
          const mudou = diffCampos(p, quantPayload(quantParaForm(originais.get(l.id))));
          if (Object.keys(mudou).length) {
            tarefas.push(() => sigo.entities.AcervoQuantitativo.update(l.id, mudou));
          }
        } else {
          const ordem = proxOrdem++;
          tarefas.push(() =>
            sigo.entities.AcervoQuantitativo.create({
              ...p,
              ordem,
              empresa_id: empresaId,
              atestado_id: doc.id,
            })
          );
        }
      }
      for (const q of quantitativos) {
        if (!mantidos.has(q.id)) tarefas.push(() => sigo.entities.AcervoQuantitativo.delete(q.id));
      }
      try {
        await emLotes(tarefas);
      } catch (e) {
        // o documento já foi gravado: recarrega e fecha (tentar de novo duplicaria linhas)
        console.error("[Acervo] salvar quantitativos:", e);
        toast.error(
          "Documento salvo, mas houve erro em parte dos quantitativos — confira e edite de novo" +
            (e?.message ? `: ${e.message}` : "")
        );
        onSalvo?.(doc.id);
        onOpenChange(false);
        return;
      }

      toast.success(documento?.id ? "Documento atualizado" : "Documento criado");
      onSalvo?.(doc.id);
      onOpenChange(false);
    } catch (e) {
      console.error("[Acervo] salvar documento:", e);
      toast.error("Erro ao salvar" + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setSalvando(false);
    }
  };

  const profAtual = profissionais.find((p) => p.id === form.profissional_id);
  const execucaoIncoerente = form.com_execucao === "nao" && form.atividades.includes("execucao");
  const nSinteses = linhas.filter((l) => l.sintese && !quantVazia(l)).length;

  return (
    <Sheet open={open} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <SheetContent className="flex flex-col gap-0 p-0">
        <SheetHeader className="flex-shrink-0 border-b px-6 py-4">
          <SheetTitle>
            {documento?.id ? `Editar ${rotuloDocumento(documento)}` : "Novo documento do acervo"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <Secao titulo="Identificação">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <CampoForm label="Tipo">
                <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_DOC.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label} — {t.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CampoForm>
              <CampoForm label="Número (CAT/CAO)">
                <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
              </CampoForm>
              <CampoForm label="Conselho">
                <Input
                  value={form.conselho}
                  placeholder="CREA-MG"
                  onChange={(e) => set("conselho", e.target.value)}
                />
              </CampoForm>
              <CampoForm label="Situação da obra">
                <Select value={form.situacao} onValueChange={(v) => set("situacao", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                  </SelectContent>
                </Select>
              </CampoForm>
              <CampoForm label="ART nº">
                <Input
                  value={form.art_numero}
                  onChange={(e) => set("art_numero", e.target.value)}
                />
              </CampoForm>
              <CampoForm label="Observação da ART" className="col-span-2">
                <Input
                  value={form.art_observacao}
                  placeholder="ex.: ART de substituição, baixada em…"
                  onChange={(e) => set("art_observacao", e.target.value)}
                />
              </CampoForm>
              <CampoForm label="Ordem na lista">
                <Input
                  type="number"
                  value={form.ordem}
                  onChange={(e) => set("ordem", e.target.value)}
                />
              </CampoForm>
            </div>
          </Secao>

          <Secao titulo="Contrato">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <CampoForm label="Contratante" className="col-span-2">
                <Input
                  value={form.contratante}
                  onChange={(e) => set("contratante", e.target.value)}
                />
              </CampoForm>
              <CampoForm label="CNPJ do contratante">
                <Input
                  value={form.contratante_cnpj}
                  onChange={(e) => set("contratante_cnpj", e.target.value)}
                />
              </CampoForm>
              <CampoForm label="Contrato nº">
                <Input value={form.contrato} onChange={(e) => set("contrato", e.target.value)} />
              </CampoForm>
              <CampoForm label="Valor do contrato (R$)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => set("valor", e.target.value)}
                />
                {form.valor !== "" && (
                  <p className="text-[11px] text-slate-500">{fmtMoeda(numeroOuNull(form.valor))}</p>
                )}
              </CampoForm>
              <CampoForm label="Início">
                <Input
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => set("data_inicio", e.target.value)}
                />
              </CampoForm>
              <CampoForm label="Fim">
                <Input
                  type="date"
                  value={form.data_fim}
                  onChange={(e) => set("data_fim", e.target.value)}
                />
              </CampoForm>
              <div className="grid grid-cols-[1fr_4.5rem] gap-2">
                <CampoForm label="Cidade">
                  <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
                </CampoForm>
                <CampoForm label="UF">
                  <Input
                    value={form.uf}
                    maxLength={2}
                    onChange={(e) => set("uf", e.target.value.toUpperCase())}
                  />
                </CampoForm>
              </div>
              <CampoForm label="Objeto" className="col-span-2 md:col-span-4">
                <Textarea
                  rows={3}
                  value={form.objeto}
                  onChange={(e) => set("objeto", e.target.value)}
                />
              </CampoForm>
            </div>
          </Secao>

          <Secao titulo="Atividade técnica e profissional">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {ATIVIDADES.map((a) => {
                  const ativo = form.atividades.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => alternarAtividade(a.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        ativo
                          ? a.id === "execucao"
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-700 bg-slate-700 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:border-amber-400"
                      )}
                    >
                      {a.label}
                    </button>
                  );
                })}
                {form.atividades
                  .filter((a) => !ATIVIDADES.some((x) => x.id === a))
                  .map((a) => (
                    <span
                      key={a}
                      className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs text-slate-600"
                    >
                      {a}
                    </span>
                  ))}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <CampoForm label="A ART registra “Execução de obra”?">
                  <Select value={form.com_execucao} onValueChange={(v) => set("com_execucao", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">Sim — com execução</SelectItem>
                      <SelectItem value="nao">Não — sem execução</SelectItem>
                      <SelectItem value="ni">Não informado</SelectItem>
                    </SelectContent>
                  </Select>
                  {execucaoIncoerente && (
                    <p className="flex items-center gap-1 text-[11px] text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> Atividade “Execução” marcada, mas ART
                      sem execução
                    </p>
                  )}
                </CampoForm>
                <CampoForm label="Profissional (quadro técnico)">
                  <Select
                    value={form.profissional_id || SEM_PROFISSIONAL}
                    onValueChange={(v) => {
                      if (v === SEM_PROFISSIONAL) {
                        set("profissional_id", "");
                        return;
                      }
                      const p = profissionais.find((x) => x.id === v);
                      setForm((f) => ({
                        ...f,
                        profissional_id: v,
                        profissional_nome: p?.nome || f.profissional_nome,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_PROFISSIONAL}>— não vinculado —</SelectItem>
                      {profissionais
                        .filter((p) => p.ativo !== false || p.id === form.profissional_id)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
                        ))}
                      {form.profissional_id && !profAtual && (
                        <SelectItem value={form.profissional_id}>
                          (profissional excluído)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </CampoForm>
                <CampoForm label="Nome do profissional (como na CAT)">
                  <Input
                    value={form.profissional_nome}
                    onChange={(e) => set("profissional_nome", e.target.value)}
                  />
                </CampoForm>
                {(form.tipo === "cat_profissional" || form.empresa_executora) && (
                  <CampoForm label="Empresa executora" className="md:col-span-3">
                    <Input
                      value={form.empresa_executora}
                      placeholder="quem executou a obra (CAT profissional)"
                      onChange={(e) => set("empresa_executora", e.target.value)}
                    />
                  </CampoForm>
                )}
                {(form.tipo === "cao" || form.cobre_arts) && (
                  <CampoForm
                    label="ARTs cobertas pela CAO (uma por linha)"
                    className="md:col-span-3"
                  >
                    <Textarea
                      rows={3}
                      value={form.cobre_arts}
                      onChange={(e) => set("cobre_arts", e.target.value)}
                    />
                  </CampoForm>
                )}
              </div>
            </div>
          </Secao>

          <Secao titulo="Riscos e observações">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <CampoForm label="Riscos (divergências a citar sempre que usar)">
                <Textarea
                  rows={5}
                  className="border-amber-300 focus-visible:ring-amber-400"
                  value={form.riscos}
                  onChange={(e) => set("riscos", e.target.value)}
                />
              </CampoForm>
              <CampoForm label="Observações">
                <Textarea
                  rows={5}
                  value={form.observacoes}
                  onChange={(e) => set("observacoes", e.target.value)}
                />
              </CampoForm>
            </div>
          </Secao>

          <Secao titulo="PDF da CAT / atestado">
            <div className="flex flex-wrap items-center gap-2">
              {form.arquivo_ref ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => setVerPdf(true)}>
                    <FileText className="mr-1.5 h-4 w-4" />
                    {nomeDoArquivo(form.arquivo_ref, "Abrir arquivo")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-slate-500"
                    onClick={() => set("arquivo_ref", null)}
                  >
                    <X className="mr-1 h-4 w-4" /> Remover
                  </Button>
                </>
              ) : (
                <span className="text-sm text-slate-500">Nenhum arquivo anexado.</span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enviando}
                onClick={() => inputPdf.current?.click()}
              >
                {enviando ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                {form.arquivo_ref ? "Substituir" : "Enviar PDF"}
              </Button>
              <input
                ref={inputPdf}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => enviarPdf(e.target.files?.[0])}
              />
            </div>
          </Secao>

          <Secao titulo={`Códigos CREA da atividade técnica (${form.codigos_crea.length})`}>
            {form.codigos_crea.length > 0 && (
              <div className="space-y-2">
                {form.codigos_crea.map((c) => (
                  <div
                    key={c._k}
                    className="grid grid-cols-[7rem_1fr_6rem_5rem_2rem] items-center gap-2"
                  >
                    <Input
                      className="h-8 text-sm"
                      placeholder="11.9.12.1"
                      value={c.codigo}
                      onChange={(e) => setCodigo(c._k, "codigo", e.target.value)}
                    />
                    <Input
                      className="h-8 text-sm"
                      placeholder="Descrição"
                      value={c.descricao}
                      onChange={(e) => setCodigo(c._k, "descricao", e.target.value)}
                    />
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      step="any"
                      placeholder="Qtd."
                      value={c.quantidade}
                      onChange={(e) => setCodigo(c._k, "quantidade", e.target.value)}
                    />
                    <Input
                      className="h-8 text-sm"
                      placeholder="Unid."
                      value={c.unidade}
                      onChange={(e) => setCodigo(c._k, "unidade", e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-600"
                      title="Remover código"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          codigos_crea: f.codigos_crea.filter((x) => x._k !== c._k),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  codigos_crea: [
                    ...f.codigos_crea,
                    { _k: novaChave(), codigo: "", descricao: "", quantidade: "", unidade: "" },
                  ],
                }))
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Código CREA
            </Button>
          </Secao>

          <Secao
            titulo={`Quantitativos (${linhas.filter((l) => !quantVazia(l)).length} · ${nSinteses} síntese(s))`}
          >
            <p className="text-xs text-slate-500">
              Marque <strong>Síntese</strong> na linha que totaliza a categoria nesta obra — só ela
              entra nos totais e tetos do Resumo (uma por categoria). As demais são detalhe.
            </p>
            {linhas.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-16 px-1 py-1 font-medium">Síntese</th>
                      <th className="w-48 px-1 py-1 font-medium">Categoria</th>
                      <th className="px-1 py-1 font-medium">Descrição</th>
                      <th className="w-28 px-1 py-1 font-medium">Qtd.</th>
                      <th className="w-20 px-1 py-1 font-medium">Unid.</th>
                      <th className="w-52 px-1 py-1 font-medium">Especificação</th>
                      <th
                        className="w-16 px-1 py-1 font-medium"
                        title="Consta na atividade técnica da ART"
                      >
                        Na ART
                      </th>
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l._k} className={cn(l.sintese && "bg-amber-50/70")}>
                        <td className="px-1 py-1 text-center">
                          <Checkbox
                            checked={l.sintese}
                            onCheckedChange={(v) => setLinha(l._k, "sintese", v === true)}
                            aria-label="Síntese"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Select
                            value={l.categoria}
                            onValueChange={(v) => escolherCategoria(l._k, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIAS.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.label}
                                </SelectItem>
                              ))}
                              {!CATEGORIAS.some((c) => c.id === l.categoria) && (
                                <SelectItem value={l.categoria}>{l.categoria}</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            className="h-8 text-sm"
                            value={l.descricao}
                            onChange={(e) => setLinha(l._k, "descricao", e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            className="h-8 text-right text-sm"
                            type="number"
                            step="any"
                            value={l.quantidade}
                            onChange={(e) => setLinha(l._k, "quantidade", e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            className="h-8 text-sm"
                            value={l.unidade}
                            onChange={(e) => setLinha(l._k, "unidade", e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            className="h-8 text-sm"
                            value={l.especificacao}
                            onChange={(e) => setLinha(l._k, "especificacao", e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <Checkbox
                            checked={l.na_atividade_tecnica}
                            onCheckedChange={(v) =>
                              setLinha(l._k, "na_atividade_tecnica", v === true)
                            }
                            aria-label="Consta na atividade técnica da ART"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-600"
                            title="Remover linha"
                            onClick={() => setLinhas((ls) => ls.filter((x) => x._k !== l._k))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button type="button" variant="outline" size="sm" onClick={novaLinha}>
              <Plus className="mr-1 h-4 w-4" /> Quantitativo
            </Button>
          </Secao>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-3 border-t px-6 py-4">
          <Button variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600"
            disabled={salvando || enviando}
            onClick={salvar}
          >
            {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {salvando ? "Salvando..." : "Salvar documento"}
          </Button>
        </div>

        <AnexoViewer
          anexo={{ url: form.arquivo_ref, nome: nomeDoArquivo(form.arquivo_ref, "Documento") }}
          open={verPdf && !!form.arquivo_ref}
          onOpenChange={setVerPdf}
        />
      </SheetContent>
    </Sheet>
  );
}
