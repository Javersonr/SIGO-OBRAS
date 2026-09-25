import React, { useEffect, useMemo, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { matchBusca } from "@/lib/busca";
import { refDoUpload, nomeDoArquivo } from "@/lib/anexo-ref";
import AnexoViewer from "@/components/shared/AnexoViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TIPOS_DOC,
  ehSintese,
  fmtData,
  fmtMoeda,
  fmtNumero,
  fmtPeriodo,
  labelAtividade,
  labelCategoria,
  localDocumento,
  rotuloDocumento,
  semExecucao,
  textoBuscaDocumento,
} from "./acervo-utils";
import { Aviso, Campo, Selo, TipoDocBadge } from "./AcervoUi";
import DocumentoSheet, { BUCKET_ACERVO, LIMITE_PDF } from "./DocumentoSheet";

function TabelaQuantitativos({ linhas }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-1.5 font-medium">Categoria</th>
            <th className="px-2 py-1.5 font-medium">Descrição</th>
            <th className="px-2 py-1.5 text-right font-medium">Quantidade</th>
            <th className="px-2 py-1.5 font-medium">Especificação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((q) => (
            <tr key={q.id}>
              <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">
                {labelCategoria(q.categoria)}
              </td>
              <td className="px-2 py-1.5 text-slate-800">
                {q.descricao}
                {q.na_atividade_tecnica && (
                  <Selo cor="green" className="ml-1.5" title="Consta na atividade técnica da ART">
                    na ART
                  </Selo>
                )}
              </td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums font-medium">
                {fmtNumero(q.quantidade)} {q.unidade}
              </td>
              <td className="px-2 py-1.5 text-slate-500">{q.especificacao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocumentoLinha({
  doc,
  quants,
  aberto,
  onAlternar,
  onEditar,
  onExcluir,
  onAbrirPdf,
  onEnviarPdf,
  enviando,
  refLinha,
  podeEditar,
}) {
  const [verDetalhe, setVerDetalhe] = useState(false);
  const inputPdf = useRef(null);
  const sinteses = quants.filter(ehSintese);
  const detalhes = quants.filter((q) => !ehSintese(q));
  const semExec = semExecucao(doc);
  const andamento = doc.situacao === "em_andamento";
  const temRiscos = !!String(doc.riscos || "").trim();
  const codigos = Array.isArray(doc.codigos_crea) ? doc.codigos_crea : [];
  const atividades = Array.isArray(doc.atividades) ? doc.atividades : [];
  const arts = Array.isArray(doc.cobre_arts) ? doc.cobre_arts : [];

  return (
    <Card
      ref={refLinha}
      className={cn("scroll-mt-24 overflow-hidden", aberto && "ring-1 ring-amber-300")}
    >
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        {aberto ? (
          <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TipoDocBadge tipo={doc.tipo} />
            <span className="font-semibold text-slate-800">
              {doc.numero ? `nº ${doc.numero}` : "s/ nº"}
            </span>
            {semExec && (
              <Selo cor="red" icon={Ban}>
                sem execução
              </Selo>
            )}
            {andamento && (
              <Selo cor="amber" icon={Clock}>
                em andamento
              </Selo>
            )}
            {temRiscos && (
              <Selo cor="amber" icon={AlertTriangle}>
                riscos
              </Selo>
            )}
            {doc.arquivo_ref && (
              <Selo icon={FileText} title="PDF anexado">
                PDF
              </Selo>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-700">
            {doc.contratante || doc.empresa_executora || "—"}
            {localDocumento(doc) && localDocumento(doc) !== doc.contratante && (
              <span className="text-slate-500"> · {localDocumento(doc)}</span>
            )}
          </p>
          <p className="truncate text-xs text-slate-500">
            {fmtPeriodo(doc.data_inicio, doc.data_fim)}
            {doc.objeto ? ` · ${doc.objeto}` : ""}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-slate-800">{fmtMoeda(doc.valor)}</p>
          <p className="text-[11px] text-slate-500">
            {sinteses.length} síntese(s) · {quants.length} item(ns)
          </p>
        </div>
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-slate-100 bg-white px-4 py-4">
          {(podeEditar || doc.arquivo_ref) && (
            <div className="flex flex-wrap items-center gap-2">
              {podeEditar && (
                <Button size="sm" variant="outline" onClick={onEditar}>
                  <Pencil className="mr-1.5 h-4 w-4" /> Editar
                </Button>
              )}
              {doc.arquivo_ref ? (
                <Button size="sm" variant="outline" onClick={onAbrirPdf}>
                  <FileText className="mr-1.5 h-4 w-4" /> Abrir PDF
                </Button>
              ) : null}
              {podeEditar && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={enviando}
                    onClick={() => inputPdf.current?.click()}
                  >
                    {enviando ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-1.5 h-4 w-4" />
                    )}
                    {doc.arquivo_ref ? "Substituir PDF" : "Enviar PDF"}
                  </Button>
                  <input
                    ref={inputPdf}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      onEnviarPdf(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-slate-500 hover:text-red-600"
                    onClick={onExcluir}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
                  </Button>
                </>
              )}
            </div>
          )}

          {semExec && (
            <Aviso cor="red" icon={Ban} titulo="Sem execução">
              A ART não registra “Execução de obra”
              {atividades.length
                ? ` (só ${atividades.map(labelAtividade).join(", ").toLowerCase()})`
                : ""}
              . Não comprova execução — só serve onde o edital aceita projeto, consultoria ou
              fiscalização.
            </Aviso>
          )}
          {andamento && (
            <Aviso cor="amber" icon={Clock} titulo="Obra em andamento">
              Atestado parcial: confira se o edital aceita serviço em execução.
            </Aviso>
          )}
          {temRiscos && (
            <Aviso cor="amber" icon={AlertTriangle} titulo="Riscos">
              {doc.riscos}
            </Aviso>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            <Campo label="Tipo">{TIPOS_DOC.find((t) => t.id === doc.tipo)?.descricao}</Campo>
            <Campo label="Conselho">{doc.conselho}</Campo>
            <Campo label="ART">{doc.art_numero}</Campo>
            <Campo label="Contrato">{doc.contrato}</Campo>
            <Campo label="Contratante" className="col-span-2">
              {doc.contratante}
              {doc.contratante_cnpj ? ` — CNPJ ${doc.contratante_cnpj}` : ""}
            </Campo>
            <Campo label="Local">{localDocumento(doc)}</Campo>
            <Campo label="Valor">
              {doc.valor !== null && doc.valor !== undefined ? fmtMoeda(doc.valor) : null}
            </Campo>
            <Campo label="Início">{doc.data_inicio ? fmtData(doc.data_inicio) : null}</Campo>
            <Campo label="Fim">{doc.data_fim ? fmtData(doc.data_fim) : null}</Campo>
            <Campo label="Situação" sempre>
              {andamento ? (
                <span className="font-medium text-amber-700">Em andamento</span>
              ) : (
                "Concluída"
              )}
            </Campo>
            <Campo label="Profissional">{doc.profissional_nome}</Campo>
            <Campo label="Empresa executora" className="col-span-2">
              {doc.empresa_executora}
            </Campo>
            <Campo label="Observação da ART" className="col-span-2 md:col-span-4">
              {doc.art_observacao}
            </Campo>
            <Campo label="Objeto" className="col-span-2 md:col-span-4">
              {doc.objeto}
            </Campo>
            <Campo label="Atividades" className="col-span-2 md:col-span-4">
              {atividades.length ? (
                <span className="flex flex-wrap gap-1">
                  {atividades.map((a) => (
                    <Selo key={a} cor={a === "execucao" ? "green" : "slate"}>
                      {labelAtividade(a)}
                    </Selo>
                  ))}
                </span>
              ) : null}
            </Campo>
            {arts.length > 0 && (
              <Campo label={`ARTs cobertas (${arts.length})`} className="col-span-2 md:col-span-4">
                <span className="font-mono text-xs text-slate-600">
                  {arts.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" · ")}
                </span>
              </Campo>
            )}
            <Campo label="Observações" className="col-span-2 md:col-span-4">
              {doc.observacoes ? (
                <span className="whitespace-pre-line text-slate-600">{doc.observacoes}</span>
              ) : null}
            </Campo>
          </dl>

          {codigos.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Códigos CREA ({codigos.length})
              </h4>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-xs">
                {codigos.map((c, i) => (
                  <li key={i} className="flex gap-3 px-2 py-1.5">
                    <span className="w-24 flex-shrink-0 font-mono text-slate-700">
                      #{c?.codigo || "—"}
                    </span>
                    <span className="flex-1 text-slate-700">{c?.descricao}</span>
                    {c?.quantidade !== null &&
                      c?.quantidade !== undefined &&
                      c?.quantidade !== "" && (
                        <span className="whitespace-nowrap tabular-nums text-slate-600">
                          {fmtNumero(c.quantidade)} {c?.unidade}
                        </span>
                      )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quantitativos — sínteses ({sinteses.length})
            </h4>
            {sinteses.length ? (
              <TabelaQuantitativos linhas={sinteses} />
            ) : (
              <p className="text-xs text-slate-500">
                Nenhuma síntese — este documento não entra nos totais do Resumo.
              </p>
            )}
            {detalhes.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
                  onClick={() => setVerDetalhe((v) => !v)}
                >
                  {verDetalhe ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  Detalhe ({detalhes.length} itens do atestado)
                </button>
                {verDetalhe && (
                  <div className="mt-1.5">
                    <TabelaQuantitativos linhas={detalhes} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Aba Documentos: CATs, atestados, CAOs e CATs profissionais com CRUD.
 * podeEditar=false (padrão) → só leitura: sem criar/editar/excluir/enviar PDF.
 */
export default function DocumentosAcervo({
  atestados,
  quantitativos,
  profissionais,
  empresaId,
  onRecarregar,
  docFoco,
  onDocFocoTratado,
  podeEditar = false,
}) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [situacao, setSituacao] = useState("todas");
  const [abertos, setAbertos] = useState(() => new Set());
  const [editando, setEditando] = useState(null); // documento | {} (novo) | null
  const [pdfAberto, setPdfAberto] = useState(null);
  const [enviandoId, setEnviandoId] = useState(null);
  const refs = useRef({});

  const quantPorDoc = useMemo(() => {
    const m = new Map();
    for (const q of quantitativos) {
      if (!m.has(q.atestado_id)) m.set(q.atestado_id, []);
      m.get(q.atestado_id).push(q);
    }
    return m;
  }, [quantitativos]);

  const filtrados = useMemo(
    () =>
      atestados.filter((a) => {
        if (tipo !== "todos" && a.tipo !== tipo) return false;
        if (situacao === "em_andamento" && a.situacao !== "em_andamento") return false;
        if (situacao === "concluida" && a.situacao === "em_andamento") return false;
        if (situacao === "sem_execucao" && !semExecucao(a)) return false;
        if (situacao === "com_riscos" && !String(a.riscos || "").trim()) return false;
        if (situacao === "sem_pdf" && a.arquivo_ref) return false;
        return matchBusca(busca, textoBuscaDocumento(a));
      }),
    [atestados, tipo, situacao, busca]
  );

  // vindo do Resumo (clique num teto): limpa filtros, expande e rola até ele
  useEffect(() => {
    if (!docFoco) return;
    setBusca("");
    setTipo("todos");
    setSituacao("todas");
    setAbertos((s) => new Set(s).add(docFoco));
    const t = setTimeout(() => {
      refs.current[docFoco]?.scrollIntoView({ behavior: "smooth", block: "start" });
      onDocFocoTratado?.();
    }, 80);
    return () => clearTimeout(t);
  }, [docFoco, onDocFocoTratado]);

  const alternar = (id) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const excluir = async (doc) => {
    if (!podeEditar) return;
    const qtd = quantPorDoc.get(doc.id)?.length || 0;
    if (
      !window.confirm(
        `Excluir ${rotuloDocumento(doc)}${qtd ? ` e seus ${qtd} quantitativo(s)` : ""}? A IA deixa de considerá-lo.`
      )
    ) {
      return;
    }
    try {
      if (qtd) await sigo.entities.AcervoQuantitativo.deleteMany({ atestado_id: doc.id });
      await sigo.entities.AcervoAtestado.delete(doc.id);
      toast.success("Documento excluído");
      onRecarregar?.();
    } catch (e) {
      console.error("[Acervo] excluir documento:", e);
      toast.error("Erro ao excluir" + (e?.message ? `: ${e.message}` : ""));
    }
  };

  const enviarPdf = async (doc, file) => {
    if (!file || !podeEditar) return;
    if (file.size > LIMITE_PDF) {
      toast.error("Arquivo acima de 25 MB");
      return;
    }
    setEnviandoId(doc.id);
    try {
      // grava a referência "bucket/path" (a URL assinada expira em 1h)
      const ref = refDoUpload(
        await sigo.integrations.Core.UploadFile({ file, bucket: BUCKET_ACERVO })
      );
      if (!ref) throw new Error("Upload sem referência");
      await sigo.entities.AcervoAtestado.update(doc.id, { arquivo_ref: ref });
      toast.success("PDF anexado");
      onRecarregar?.();
    } catch (e) {
      console.error("[Acervo] upload PDF:", e);
      toast.error("Erro ao enviar o PDF" + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setEnviandoId(null);
    }
  };

  const todosAbertos = filtrados.length > 0 && filtrados.every((a) => abertos.has(a.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número, contratante, cidade, objeto, ART, código CREA…"
            className="pl-9"
          />
        </div>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPOS_DOC.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={situacao} onValueChange={setSituacao}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Qualquer situação</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
            <SelectItem value="em_andamento">Em andamento</SelectItem>
            <SelectItem value="sem_execucao">Sem execução</SelectItem>
            <SelectItem value="com_riscos">Com riscos</SelectItem>
            <SelectItem value="sem_pdf">Sem PDF</SelectItem>
          </SelectContent>
        </Select>
        {podeEditar && (
          <Button className="bg-amber-500 hover:bg-amber-600" onClick={() => setEditando({})}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo documento
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {filtrados.length} de {atestados.length} documento(s)
        </span>
        {filtrados.length > 0 && (
          <button
            type="button"
            className="font-medium text-amber-700 hover:underline"
            onClick={() =>
              setAbertos(todosAbertos ? new Set() : new Set(filtrados.map((a) => a.id)))
            }
          >
            {todosAbertos ? "Recolher todos" : "Expandir todos"}
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-xl bg-slate-50 py-12 text-center">
          <FolderOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-500">
            {atestados.length ? "Nenhum documento com esses filtros" : "Nenhum documento no acervo"}
          </p>
          {!atestados.length && podeEditar && (
            <p className="mt-1 text-sm text-slate-400">
              Cadastre as CATs, atestados e CAOs com os quantitativos de cada obra.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((doc) => (
            <DocumentoLinha
              key={doc.id}
              refLinha={(el) => {
                refs.current[doc.id] = el;
              }}
              doc={doc}
              quants={quantPorDoc.get(doc.id) || []}
              aberto={abertos.has(doc.id)}
              onAlternar={() => alternar(doc.id)}
              onEditar={() => setEditando(doc)}
              onExcluir={() => excluir(doc)}
              onAbrirPdf={() =>
                setPdfAberto({ url: doc.arquivo_ref, nome: nomeDoArquivo(doc.arquivo_ref, "CAT") })
              }
              onEnviarPdf={(file) => enviarPdf(doc, file)}
              enviando={enviandoId === doc.id}
              podeEditar={podeEditar}
            />
          ))}
        </div>
      )}

      <DocumentoSheet
        open={podeEditar && !!editando}
        onOpenChange={(v) => !v && setEditando(null)}
        documento={editando?.id ? editando : null}
        quantitativos={editando?.id ? quantPorDoc.get(editando.id) || [] : []}
        profissionais={profissionais}
        empresaId={empresaId}
        onSalvo={(id) => {
          if (id) setAbertos((s) => new Set(s).add(id));
          onRecarregar?.();
        }}
      />

      <AnexoViewer
        anexo={pdfAberto}
        open={!!pdfAberto}
        onOpenChange={(v) => !v && setPdfAberto(null)}
      />
    </div>
  );
}
