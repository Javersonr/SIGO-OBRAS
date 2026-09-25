import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { sigo, resolveStorageUrl } from "@/api/sigoClient";
import { useEmpresa } from "@/Layout";
import { ehPdf, nomeDoArquivo, refDoUpload } from "@/lib/anexo-ref";
import { formatBRL } from "@/lib/formatters";
import {
  CATEGORIAS_ARQUIVO_EDITAL,
  MODALIDADES_LICITACAO,
  analisarAtende,
  camposOportunidadeDoEdital,
  categoriaPeloNome,
  dataDoEdital,
  horaDoEdital,
  lerEdital,
  numeroDoEdital,
  ufDoEdital,
} from "@/lib/edital-ia";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
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
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ChevronLeft,
  FileSearch,
  FileText,
  Loader2,
  Paperclip,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import AtendeEdital from "./AtendeEdital";

/**
 * Lê o edital (PDFs) com IA e cria/atualiza a oportunidade:
 *   1. Arquivos (edital, TR, anexos, errata) → 2. Leitura (cancelável) →
 *   3. Conferência dos campos → salvar (anexa os PDFs, grava edital_analise) →
 *   4. "Atende?" (acervo da empresa do token) → "Abrir oportunidade".
 *
 * Props: open, onOpenChange, empresaAtiva, user, oportunidade? (existente →
 * atualiza), statusInicial? {id, nome}, responsavelInicial? (p/ responsaveis_ids),
 * onConcluido(oportunidadeId) — chamado no "Abrir oportunidade" (o Sheet fecha),
 * onAnaliseGravada?(oportunidadeId, edital_analise) — quando o "Atende?" grava
 * o resultado, MESMO com o Sheet já fechado (o pai atualiza o estado sem reler
 * nem pagar outra análise).
 */

const BUCKET = "anexos-oportunidade";
const LIMITE_UPLOAD = 25 * 1024 * 1024; // file_size_limit do bucket
const CATEGORIAS_EDITAL = new Set(CATEGORIAS_ARQUIVO_EDITAL.map((c) => c.valor));

const PASSOS = [
  { id: "arquivos", rotulo: "Arquivos" },
  { id: "leitura", rotulo: "Leitura" },
  { id: "conferencia", rotulo: "Conferência" },
  { id: "atende", rotulo: "Atende?" },
];

const FORMAS = [
  { valor: "eletronica", rotulo: "Eletrônica" },
  { valor: "presencial", rotulo: "Presencial" },
];

// Campos do formulário de conferência (colunas de public.oportunidade).
const CAMPOS_TEXTO = [
  "nome",
  "orgao",
  "licitacao_numero",
  "licitacao_processo",
  "licitacao_portal",
  "licitacao_criterio_julgamento",
  "licitacao_prazo_execucao",
  "licitacao_visita_tecnica",
  "cidade",
  "endereco",
  "descricao",
];
const CAMPOS_DATA = [
  "licitacao_data",
  "licitacao_data_proposta",
  "licitacao_data_impugnacao",
  "licitacao_data_esclarecimento",
];
const CAMPOS_HORA = [
  "licitacao_horario",
  "licitacao_horario_proposta",
  "licitacao_horario_impugnacao",
  "licitacao_horario_esclarecimento",
];
const CAMPOS_BOOL = ["licitacao_garantia_proposta", "licitacao_exclusiva_me_epp"];
const CAMPOS_SELECT = ["licitacao_modalidade", "licitacao_forma"];
const TODOS_CAMPOS = [
  ...CAMPOS_TEXTO,
  ...CAMPOS_DATA,
  ...CAMPOS_HORA,
  ...CAMPOS_BOOL,
  ...CAMPOS_SELECT,
  "valor_estimado",
  "estado",
];
// Numa oportunidade existente, título e descrição digitados pelo usuário ficam.
const PRESERVAR_EXISTENTE = new Set(["nome", "descricao"]);

const PRAZOS = [
  { rotulo: "Sessão pública", data: "licitacao_data", hora: "licitacao_horario", pag: "sessao" },
  {
    rotulo: "Limite da proposta",
    data: "licitacao_data_proposta",
    hora: "licitacao_horario_proposta",
    pag: "proposta_limite",
  },
  {
    rotulo: "Limite para impugnação",
    data: "licitacao_data_impugnacao",
    hora: "licitacao_horario_impugnacao",
    pag: "impugnacao_limite",
  },
  {
    rotulo: "Limite para esclarecimentos",
    data: "licitacao_data_esclarecimento",
    hora: "licitacao_horario_esclarecimento",
    pag: "esclarecimento_limite",
  },
];

const ECONOMICA_ROTULOS = {
  capital_social: "Capital social mínimo",
  patrimonio_liquido: "Patrimônio líquido mínimo",
  capital_ou_pl: "Capital social ou PL mínimo",
  ccl: "Capital circulante líquido",
  liquidez_corrente: "Liquidez corrente",
  liquidez_geral: "Liquidez geral",
  solvencia_geral: "Solvência geral",
  endividamento: "Endividamento",
  faturamento: "Faturamento",
  outro: "Outro",
};
const INDICES = new Set([
  "liquidez_corrente",
  "liquidez_geral",
  "solvencia_geral",
  "endividamento",
]);
const REGISTRO_ROTULOS = {
  crea: "Registro no CREA",
  visto_crea: "Visto do CREA",
  cadastro_concessionaria: "Cadastro na concessionária",
  outro: "Registro",
};

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

// "AAAA-MM-DD" → "DD/MM/AAAA" sem Date (new Date() cai 1 dia no fuso BR)
const dataBR = (iso) => {
  const [a, m, d] = String(iso || "").split("-");
  return a && m && d ? `${d.slice(0, 2)}/${m}/${a}` : "";
};

const tamanhoLegivel = (b) => {
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
};

const vazio = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim());

/** Valor de uma coluna normalizado p/ o formulário (e p/ comparar). */
function normalizarCampo(k, v) {
  if (vazio(v)) return null;
  if (CAMPOS_DATA.includes(k)) return dataDoEdital(v);
  if (CAMPOS_HORA.includes(k)) return horaDoEdital(v) || String(v).trim();
  if (CAMPOS_BOOL.includes(k)) return v === true || v === false ? v : null;
  if (k === "valor_estimado") {
    const n = numeroDoEdital(v);
    return n ? n : null; // 0 = não informado (default da coluna)
  }
  if (k === "estado") return ufDoEdital(v) || String(v).trim().toUpperCase().slice(0, 2);
  return String(v).trim();
}

const iguais = (a, b) => (a ?? null) === (b ?? null) || String(a ?? "") === String(b ?? "");

function formInicial(ia, op) {
  const f = {};
  for (const k of TODOS_CAMPOS) {
    const doIa = normalizarCampo(k, ia[k]);
    if (!op) {
      f[k] = doIa;
      continue;
    }
    const atual = normalizarCampo(k, op[k]);
    f[k] = PRESERVAR_EXISTENTE.has(k) ? (atual ?? doIa) : (doIa ?? atual);
  }
  return f;
}

function paginaDe(extraido, chave) {
  if (!extraido || !chave) return null;
  if (chave === "garantia") return extraido.garantia_proposta?.pagina || null;
  return extraido.datas?.[chave]?.pagina || null;
}

function rotuloOpcao(opcoes, v) {
  return opcoes.find((o) => o.valor === v)?.rotulo || v;
}

function valorLegivel(k, v) {
  if (vazio(v)) return "—";
  if (CAMPOS_DATA.includes(k)) return dataBR(v);
  if (CAMPOS_BOOL.includes(k)) return v ? "Sim" : "Não";
  if (k === "valor_estimado") return formatBRL(v);
  if (k === "licitacao_modalidade") return rotuloOpcao(MODALIDADES_LICITACAO, v);
  if (k === "licitacao_forma") return rotuloOpcao(FORMAS, v);
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

async function baixarAnexo(a, signal) {
  const url = await resolveStorageUrl(a.ref);
  if (!url) {
    throw new Error(`O anexo "${a.nome}" não está mais disponível. Envie o PDF de novo.`);
  }
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`Não foi possível baixar "${a.nome}" (HTTP ${resp.status}).`);
  const blob = await resp.blob();
  const nome = /\.pdf$/i.test(a.nome) ? a.nome : `${a.nome}.pdf`;
  return new File([blob], nome, { type: "application/pdf" });
}

// ---------------------------------------------------------------------------
// Pedaços de UI
// ---------------------------------------------------------------------------
function Pagina({ n }) {
  if (!n) return null;
  return (
    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-px text-[11px] font-normal text-slate-500">
      pág. {n}
    </span>
  );
}

/** Numa oportunidade existente: mostra o valor atual × o lido do edital. */
function DicaValor({ k, ia, atual, valor, onUsar }) {
  if (vazio(ia) || vazio(atual) || iguais(ia, atual)) return null;
  const usandoIa = iguais(valor, ia);
  const outro = usandoIa ? atual : ia;
  return (
    <p className="mt-1 text-xs text-slate-500">
      {usandoIa ? "Valor atual: " : "Lido no edital: "}
      <span className="text-slate-700">{valorLegivel(k, outro)}</span>{" "}
      <button
        type="button"
        onClick={() => onUsar(outro)}
        className="font-medium text-amber-700 hover:underline"
      >
        {usandoIa ? "manter atual" : "usar"}
      </button>
    </p>
  );
}

function InputMoeda({ id, value, onChange }) {
  const [foco, setFoco] = useState(false);
  const [texto, setTexto] = useState("");
  return (
    <Input
      id={id}
      inputMode="decimal"
      placeholder="R$ 0,00"
      value={foco ? texto : value == null ? "" : formatBRL(value)}
      onFocus={() => {
        setFoco(true);
        setTexto(value == null ? "" : String(value).replace(".", ","));
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d,.]/g, "");
        setTexto(raw);
        onChange(numeroDoEdital(raw));
      }}
      onBlur={() => setFoco(false)}
    />
  );
}

function Secao({ titulo, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
      <h4 className="mb-3 text-sm font-semibold text-slate-700">{titulo}</h4>
      {children}
    </section>
  );
}

function ListaExigencias({ titulo, itens, render }) {
  if (!itens?.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {titulo} <span className="font-normal text-slate-400">({itens.length})</span>
      </p>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {itens.map((it, i) => {
          const { principal, detalhe } = render(it);
          return (
            <li key={it.id || i} className="px-3 py-2 text-sm" title={it.trecho || undefined}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-slate-800">
                  {it.id && <span className="mr-1.5 text-xs text-slate-400">{it.id}</span>}
                  {principal || "—"}
                </span>
                <Pagina n={it.pagina} />
              </div>
              {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const juntar = (...partes) => partes.filter(Boolean).join(" · ");
// número vindo da IA pode ser string ("1.500", "10%"): formata se der, senão mostra como veio
const numLegivel = (q) => {
  if (q == null || q === "") return "";
  const n = typeof q === "number" ? q : numeroDoEdital(q);
  return n == null ? String(q) : NUM.format(n);
};
const brlLegivel = (v) => {
  const n = typeof v === "number" ? v : numeroDoEdital(v);
  return n == null ? "" : formatBRL(n);
};
const qtd = (q, u) => (q == null || q === "" ? null : `${numLegivel(q)} ${u || ""}`.trim());

function HabilitacaoExigida({ hab }) {
  if (!hab) return null;
  const vazioTudo =
    !hab.tecnica_operacional?.length &&
    !hab.tecnica_profissional?.length &&
    !hab.economica?.length &&
    !hab.registros?.length &&
    !hab.outros_documentos?.length;
  if (vazioTudo) {
    return (
      <p className="text-sm text-slate-500">
        A IA não encontrou exigências de habilitação nos PDFs lidos — confira o edital.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <ListaExigencias
        titulo="Técnico-operacional (empresa)"
        itens={hab.tecnica_operacional}
        render={(it) => ({
          principal: it.descricao || it.servico,
          detalhe: juntar(
            qtd(it.quantidade, it.unidade),
            it.percentual_minimo != null && `mín. ${NUM.format(it.percentual_minimo)}%`,
            it.somatorio_permitido === true && "somatório de atestados permitido",
            it.somatorio_permitido === false && "sem somatório",
            it.exige_execucao === true && "exige execução comprovada"
          ),
        })}
      />
      <ListaExigencias
        titulo="Técnico-profissional (RT)"
        itens={hab.tecnica_profissional}
        render={(it) => ({
          principal: it.descricao || it.servico,
          detalhe: juntar(
            it.profissional,
            it.descricao && it.servico,
            qtd(it.quantidade, it.unidade)
          ),
        })}
      />
      <ListaExigencias
        titulo="Econômico-financeira"
        itens={hab.economica}
        render={(it) => {
          const indice = INDICES.has(it.tipo);
          const valor =
            it.valor_minimo == null
              ? null
              : indice
                ? `${it.tipo === "endividamento" ? "≤" : "≥"} ${NUM.format(it.valor_minimo)}`
                : `mín. ${formatBRL(it.valor_minimo)}`;
          return {
            principal: ECONOMICA_ROTULOS[it.tipo] || it.descricao,
            detalhe: juntar(
              valor,
              it.percentual_do_estimado != null &&
                `${NUM.format(it.percentual_do_estimado)}% do estimado`,
              it.exercicio && `exercício ${it.exercicio}`,
              ECONOMICA_ROTULOS[it.tipo] && it.descricao
            ),
          };
        }}
      />
      <ListaExigencias
        titulo="Registros e cadastros"
        itens={hab.registros}
        render={(it) => ({
          principal: REGISTRO_ROTULOS[it.tipo] || it.descricao,
          detalhe: REGISTRO_ROTULOS[it.tipo] ? it.descricao : null,
        })}
      />
      <ListaExigencias
        titulo="Outros documentos"
        itens={hab.outros_documentos}
        render={(it) => ({ principal: it.descricao })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function LerEditalSheet({
  open,
  onOpenChange,
  empresaAtiva,
  user,
  oportunidade,
  statusInicial,
  responsavelInicial,
  onConcluido,
  onAnaliseGravada,
}) {
  const ctx = useEmpresa();
  const empresa = empresaAtiva || ctx.empresaAtiva;
  const usuario = user || ctx.user;

  const [passo, setPasso] = useState("arquivos");
  const [arquivos, setArquivos] = useState([]);
  const [carregandoAnexos, setCarregandoAnexos] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [erroLeitura, setErroLeitura] = useState("");
  const [extraido, setExtraido] = useState(null);
  const [camposIa, setCamposIa] = useState({});
  const [form, setForm] = useState({});
  const [alertarPrazos, setAlertarPrazos] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [etapaSalvar, setEtapaSalvar] = useState("");
  const [opId, setOpId] = useState(null);
  const [analise, setAnalise] = useState(null);
  const [atendeStatus, setAtendeStatus] = useState("idle"); // idle | rodando | ok | erro
  const [atendeErro, setAtendeErro] = useState("");

  const abortRef = useRef(null);
  // arquivo (chave) → registro já gravado: nova tentativa de salvar não reenvia
  const salvosRef = useRef(new Map());
  // muda a cada abertura: resposta atrasada do "Atende?" não vaza p/ outra sessão
  const sessaoRef = useRef(0);
  // últimas props lidas por callbacks/efeitos que NÃO devem reiniciar por elas
  // (o pai atualiza a oportunidade quando o "Atende?" grava — não pode resetar o Sheet)
  const oportunidadeRef = useRef(oportunidade);
  const onAnaliseGravadaRef = useRef(onAnaliseGravada);
  useEffect(() => {
    oportunidadeRef.current = oportunidade;
    onAnaliseGravadaRef.current = onAnaliseGravada;
  });

  const existente = oportunidade?.id ? oportunidade : null;

  // Novo ciclo a cada abertura; fechar cancela a leitura em andamento.
  useEffect(() => {
    sessaoRef.current += 1;
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    setPasso("arquivos");
    setArquivos([]);
    setProgresso(null);
    setErroLeitura("");
    setExtraido(null);
    setCamposIa({});
    setForm({});
    // 1ª leitura (ou criação): liga os alertas. Oportunidade que JÁ tem a
    // leitura do edital: começa com o valor atual (não religa o que foi desligado).
    const op = oportunidadeRef.current;
    setAlertarPrazos(op?.id && op.edital_analise ? !!op.alertar_prazos : true);
    setSalvando(false);
    setEtapaSalvar("");
    setOpId(oportunidade?.id || null);
    setAnalise(null);
    setAtendeStatus("idle");
    setAtendeErro("");
    salvosRef.current = new Map();
  }, [open, oportunidade?.id]);

  // PDFs já anexados à oportunidade: oferece reaproveitar (edital/TR marcados).
  useEffect(() => {
    if (!open || !oportunidade?.id) return undefined;
    let vivo = true;
    setCarregandoAnexos(true);
    sigo.entities.ArquivoOportunidade.filter({ oportunidade_id: oportunidade.id })
      .then((lista) => {
        if (!vivo) return;
        const pdfs = (lista || []).filter(
          (a) => a.url && a.tipo !== "link" && (ehPdf(a.nome, a.tipo) || ehPdf(a.url, a.tipo))
        );
        const existentes = pdfs.map((a) => {
          const nome = a.nome || nomeDoArquivo(a.url, "Anexo.pdf");
          return {
            chave: `ex-${a.id}`,
            origem: "existente",
            arquivoId: a.id,
            ref: a.url,
            nome,
            tamanho: a.tamanho || 0,
            categoria: CATEGORIAS_EDITAL.has(a.categoria) ? a.categoria : categoriaPeloNome(nome),
            categoriaOriginal: a.categoria || null,
            usar: CATEGORIAS_EDITAL.has(a.categoria),
          };
        });
        setArquivos((prev) => [...existentes, ...prev.filter((p) => p.origem === "local")]);
      })
      .catch((e) => console.warn("[LerEdital] anexos:", e?.message))
      .finally(() => vivo && setCarregandoAnexos(false));
    return () => {
      vivo = false;
    };
  }, [open, oportunidade?.id]);

  const fechar = (v) => {
    if (!v && salvando) {
      toast("Aguarde terminar de salvar");
      return;
    }
    onOpenChange?.(v);
  };

  // ------------------------------------------------------------ arquivos
  const adicionarArquivos = (lista) => {
    const pdfs = [];
    for (const f of Array.from(lista || [])) {
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) pdfs.push(f);
      else toast.error(`"${f.name}" não é PDF`);
    }
    if (!pdfs.length) return;
    setArquivos((prev) => {
      let temEdital = prev.some((a) => a.usar && a.categoria === "edital");
      const out = [...prev];
      pdfs.forEach((f, i) => {
        const dup = out.some(
          (a) => a.origem === "local" && a.nome === f.name && a.tamanho === f.size
        );
        if (dup) return;
        const categoria = categoriaPeloNome(f.name, !temEdital);
        if (categoria === "edital") temEdital = true;
        out.push({
          chave: `lo-${Date.now()}-${i}-${f.name}`,
          origem: "local",
          file: f,
          nome: f.name,
          tamanho: f.size,
          categoria,
          usar: true,
        });
      });
      return out;
    });
  };

  const alterarArquivo = (chave, patch) =>
    setArquivos((prev) => prev.map((a) => (a.chave === chave ? { ...a, ...patch } : a)));

  const removerArquivo = (chave) => setArquivos((prev) => prev.filter((a) => a.chave !== chave));

  const selecionados = arquivos.filter((a) => a.usar);

  // ------------------------------------------------------------ leitura
  const iniciarLeitura = async () => {
    if (!selecionados.length) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setErroLeitura("");
    setPasso("leitura");
    setProgresso({ etapa: "preparando", texto: "Preparando os arquivos…", percentual: 0 });
    try {
      const files = [];
      for (const a of selecionados) {
        if (a.origem === "local") {
          files.push(a.file);
        } else {
          setProgresso({ etapa: "baixando", texto: `Baixando "${a.nome}"…`, percentual: 0 });
          files.push(await baixarAnexo(a, ctrl.signal));
        }
      }
      const r = await lerEdital(
        files,
        (p) => {
          if (!ctrl.signal.aborted) setProgresso(p);
        },
        { signal: ctrl.signal }
      );
      if (ctrl.signal.aborted) return;
      const ia = camposOportunidadeDoEdital(r);
      if (!ia.nome) ia.nome = (selecionados[0]?.nome || "Edital").replace(/\.pdf$/i, "");
      setExtraido(r);
      setCamposIa(ia);
      setForm(formInicial(ia, existente));
      setPasso("conferencia");
    } catch (e) {
      if (e?.name === "AbortError" || ctrl.signal.aborted) return;
      console.error("[LerEdital] leitura:", e);
      setErroLeitura(e?.message || "Erro ao ler o edital");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };

  const cancelarLeitura = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgresso(null);
    setErroLeitura("");
    setPasso("arquivos");
    toast("Leitura cancelada");
  };

  // ------------------------------------------------------------ salvar
  const campo = (k) => form[k] ?? null;
  const setCampo = (k, v) => setForm((prev) => ({ ...prev, [k]: vazio(v) ? null : v }));

  /** Form → colunas (normalizadas; null = vazio). */
  const camposParaGravar = () => {
    const c = {};
    for (const k of TODOS_CAMPOS) c[k] = normalizarCampo(k, form[k]);
    return c;
  };

  const gravarArquivos = async (id) => {
    const registros = [];
    let i = 0;
    for (const a of selecionados) {
      i += 1;
      const ja = salvosRef.current.get(a.chave);
      if (ja) {
        registros.push(ja);
        continue;
      }
      try {
        let arquivoId = a.arquivoId;
        if (a.origem === "existente") {
          if (a.categoria !== a.categoriaOriginal) {
            await sigo.entities.ArquivoOportunidade.update(a.arquivoId, {
              categoria: a.categoria,
            });
          }
        } else {
          if (a.tamanho > LIMITE_UPLOAD) {
            toast.warning(`"${a.nome}" tem mais de 25 MB: foi lido, mas não foi anexado.`);
            continue;
          }
          setEtapaSalvar(`Anexando "${a.nome}" (${i} de ${selecionados.length})…`);
          const up = await sigo.integrations.Core.UploadFile({
            file: a.file,
            bucket: BUCKET,
            mimeType: a.file.type || "application/pdf",
          });
          const ref = refDoUpload(up); // grava a ref, nunca a URL assinada
          if (!ref) throw new Error("upload sem referência");
          const reg = await sigo.entities.ArquivoOportunidade.create({
            empresa_id: empresa.id,
            oportunidade_id: id,
            nome: a.nome,
            url: ref,
            tipo: a.file.type || "application/pdf",
            tamanho: a.tamanho,
            categoria: a.categoria,
            usuario_nome: usuario?.full_name || usuario?.email || "Usuário",
          });
          arquivoId = reg.id;
        }
        const r = { arquivo_oportunidade_id: arquivoId, nome: a.nome, categoria: a.categoria };
        salvosRef.current.set(a.chave, r);
        registros.push(r);
      } catch (e) {
        console.error("[LerEdital] anexo:", e);
        toast.error(`Não foi possível anexar "${a.nome}": ${e?.message || "erro"}`);
      }
    }
    return registros;
  };

  // Grava o resultado mesmo se o Sheet fechar no meio; a tela só é atualizada
  // se ainda for a mesma abertura.
  const rodarAtende = useCallback(async (id, base) => {
    if (!id || !base?.extraido) return;
    const sessao = sessaoRef.current;
    const ativa = () => sessaoRef.current === sessao;
    setAtendeStatus("rodando");
    setAtendeErro("");
    try {
      const resultado = await analisarAtende(base.extraido);
      const nova = { ...base, atende: resultado };
      if (ativa()) {
        setAnalise(nova);
        setAtendeStatus("ok");
      }
      let gravou = false;
      try {
        await sigo.entities.Oportunidade.update(id, { edital_analise: nova });
        gravou = true;
      } catch (e) {
        toast.error(`Análise feita, mas não foi gravada: ${e?.message || "erro"}`);
      }
      if (gravou) {
        // fora do try do update: erro no callback do pai não vira "não foi gravada"
        try {
          onAnaliseGravadaRef.current?.(id, nova);
        } catch (e) {
          console.error("[LerEdital] onAnaliseGravada:", e);
        }
      }
    } catch (e) {
      console.error("[LerEdital] atende:", e);
      if (!ativa()) return;
      setAtendeStatus("erro");
      setAtendeErro(e?.message || "Erro ao conferir o acervo");
    }
  }, []);

  const salvar = async () => {
    const nome = String(form.nome || "").trim();
    if (!nome) {
      toast.error("Informe o título da oportunidade");
      return;
    }
    if (!empresa?.id) {
      toast.error("Nenhuma empresa selecionada");
      return;
    }
    setSalvando(true);
    try {
      const campos = camposParaGravar();
      let id = opId;
      let anteriores = null;
      let novos = campos;
      if (existente) {
        // só o que mudou (e o log guarda o antes/depois)
        const diff = {};
        anteriores = {};
        for (const [k, v] of Object.entries(campos)) {
          if (iguais(v, normalizarCampo(k, existente[k]))) continue;
          diff[k] = k === "valor_estimado" ? (v ?? 0) : v;
          anteriores[k] = existente[k] ?? null;
        }
        // alertar_prazos também só se o usuário mudou o checkbox
        if (alertarPrazos !== !!existente.alertar_prazos) {
          diff.alertar_prazos = alertarPrazos;
          anteriores.alertar_prazos = !!existente.alertar_prazos;
        }
        novos = diff;
        if (Object.keys(diff).length) {
          setEtapaSalvar("Atualizando a oportunidade…");
          await sigo.entities.Oportunidade.update(existente.id, diff);
        }
        id = existente.id;
      } else if (id) {
        // criada numa tentativa anterior que falhou depois (ex.: no anexo)
        setEtapaSalvar("Atualizando a oportunidade…");
        await sigo.entities.Oportunidade.update(id, {
          ...campos,
          valor_estimado: campos.valor_estimado ?? 0,
          alertar_prazos: alertarPrazos,
        });
      } else {
        setEtapaSalvar("Criando a oportunidade…");
        const payload = { empresa_id: empresa.id, alertar_prazos: alertarPrazos };
        for (const [k, v] of Object.entries(campos)) if (v !== null) payload[k] = v;
        novos = { ...payload };
        delete novos.empresa_id;
        if (statusInicial?.id) {
          payload.status_id = statusInicial.id;
          payload.status_nome = statusInicial.nome || null;
        }
        if (!vazio(responsavelInicial)) {
          // jsonb como ARRAY (formato das linhas atuais); a string JSON é
          // legado do Base44 que o resto do sistema ainda precisa tolerar
          payload.responsaveis_ids = Array.isArray(responsavelInicial)
            ? responsavelInicial
            : [responsavelInicial];
        }
        const nova = await sigo.entities.Oportunidade.create(payload);
        id = nova.id;
        setOpId(id);
      }

      const registros = await gravarArquivos(id);

      setEtapaSalvar("Gravando a análise…");
      const agora = new Date().toISOString();
      const analiseNova = {
        versao: 1,
        extraido,
        atende: null,
        arquivos: registros,
        analisado_em: agora,
        analisado_por: usuario?.email || null,
      };
      await sigo.entities.Oportunidade.update(id, {
        edital_analise: analiseNova,
        edital_analisado_em: agora,
      });
      setAnalise(analiseNova);

      sigo.entities.OportunidadeAtualizacao.create({
        empresa_id: empresa.id,
        oportunidade_id: id,
        usuario_nome: usuario?.full_name || usuario?.email || null,
        tipo: "Sistema",
        descricao: "Dados preenchidos pela IA a partir do edital",
        dados_anteriores: anteriores,
        dados_novos: { ...novos, arquivos: registros.map((r) => r.nome) },
      }).catch(() => {});

      toast.success(existente ? "Oportunidade atualizada" : "Oportunidade criada");
      setPasso("atende");
      rodarAtende(id, analiseNova);
    } catch (e) {
      console.error("[LerEdital] salvar:", e);
      toast.error(`Erro ao salvar: ${e?.message || "erro desconhecido"}`);
    } finally {
      setSalvando(false);
      setEtapaSalvar("");
    }
  };

  const abrirOportunidade = () => {
    if (!opId || atendeStatus === "rodando") return;
    onConcluido?.(opId);
    onOpenChange?.(false);
  };

  // ------------------------------------------------------------ render
  const indicePasso = PASSOS.findIndex((p) => p.id === passo);

  const renderCampoTexto = (k, rotulo, { col = "", placeholder = "", pag = null } = {}) => (
    <div className={col}>
      <Label htmlFor={`le-${k}`} className="flex items-center">
        {rotulo}
        <Pagina n={pag} />
      </Label>
      <Input
        id={`le-${k}`}
        value={campo(k) ?? ""}
        placeholder={placeholder}
        onChange={(e) => setCampo(k, e.target.value)}
        className="mt-1.5"
      />
      {existente && (
        <DicaValor
          k={k}
          ia={normalizarCampo(k, camposIa[k])}
          atual={normalizarCampo(k, existente[k])}
          valor={campo(k)}
          onUsar={(v) => setCampo(k, v)}
        />
      )}
    </div>
  );

  const renderSelect = (k, rotulo, opcoes) => (
    <div>
      <Label>{rotulo}</Label>
      <Select value={campo(k) ?? ""} onValueChange={(v) => setCampo(k, v)}>
        <SelectTrigger className="mt-1.5">
          <SelectValue placeholder="Não informada" />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {existente && (
        <DicaValor
          k={k}
          ia={normalizarCampo(k, camposIa[k])}
          atual={normalizarCampo(k, existente[k])}
          valor={campo(k)}
          onUsar={(v) => setCampo(k, v)}
        />
      )}
    </div>
  );

  /** "Valor atual × lido no edital" de um campo (só em oportunidade existente). */
  const dicaValor = (k) =>
    existente ? (
      <DicaValor
        k={k}
        ia={normalizarCampo(k, camposIa[k])}
        atual={normalizarCampo(k, existente[k])}
        valor={campo(k)}
        onUsar={(v) => setCampo(k, v)}
      />
    ) : null;

  const passoArquivos = (
    <div className="space-y-5">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          adicionarArquivos(e.dataTransfer?.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          arrastando
            ? "border-amber-400 bg-amber-50"
            : "border-slate-300 bg-slate-50 hover:border-amber-300 hover:bg-amber-50/40"
        }`}
      >
        <Upload className="mb-2 h-8 w-8 text-amber-500" />
        <p className="text-sm font-medium text-slate-700">
          Arraste os PDFs aqui ou clique para escolher
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Edital, termo de referência, anexos e erratas — pode enviar vários de uma vez
        </p>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            adicionarArquivos(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {carregandoAnexos && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando PDFs já anexados à oportunidade…
        </p>
      )}

      {arquivos.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Arquivos para a leitura
          </div>
          <ul className="divide-y divide-slate-100">
            {arquivos.map((a) => (
              <li key={a.chave} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Checkbox
                  checked={a.usar}
                  onCheckedChange={(v) => alterarArquivo(a.chave, { usar: v === true })}
                  aria-label={`Usar ${a.nome}`}
                  className="border-slate-300 data-[state=checked]:border-amber-500 data-[state=checked]:bg-amber-500"
                />
                <FileText className="h-5 w-5 flex-shrink-0 text-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800" title={a.nome}>
                    {a.nome}
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.origem === "existente" ? (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="h-3 w-3" /> já anexado à oportunidade
                      </span>
                    ) : (
                      "novo"
                    )}
                    {a.tamanho ? ` · ${tamanhoLegivel(a.tamanho)}` : ""}
                    {a.origem === "local" && a.tamanho > LIMITE_UPLOAD && (
                      <span className="text-amber-700"> · acima de 25 MB: lê, mas não anexa</span>
                    )}
                  </p>
                </div>
                <Select
                  value={a.categoria}
                  onValueChange={(v) => alterarArquivo(a.chave, { categoria: v })}
                >
                  <SelectTrigger className="h-9 w-full sm:w-[210px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_ARQUIVO_EDITAL.map((c) => (
                      <SelectItem key={c.valor} value={c.valor}>
                        {c.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {a.origem === "local" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removerArquivo(a.chave)}
                    className="h-9 w-9 text-slate-400 hover:text-red-600"
                    aria-label={`Remover ${a.nome}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <p className="mb-1 font-semibold text-slate-700">Como funciona</p>A IA lê o texto dos PDFs
        no seu navegador (páginas digitalizadas vão como imagem, até 60 no total), extrai prazos,
        dados do certame e exigências de habilitação e mostra tudo para você conferir antes de
        salvar. Depois confere as exigências com o acervo técnico da {empresa?.nome || "empresa"}.
      </div>
    </div>
  );

  const etapaIdx = (() => {
    const e = progresso?.etapa;
    if (e === "ia") return 1;
    if (e === "consolidar") return 2;
    if (e === "concluido") return 3;
    return 0;
  })();

  const passoLeitura = erroLeitura ? (
    <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <XCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
      <p className="font-semibold text-red-800">Não foi possível ler o edital</p>
      <p className="mt-1 text-sm text-red-700">{erroLeitura}</p>
    </div>
  ) : (
    <div className="mx-auto max-w-xl space-y-5 py-4">
      <div className="text-center">
        <Sparkles className="mx-auto mb-2 h-8 w-8 text-amber-500" />
        <p className="text-base font-semibold text-slate-800">Lendo o edital…</p>
        <p className="mt-1 text-sm text-slate-500">
          Editais grandes levam alguns minutos. Mantenha esta janela aberta.
        </p>
      </div>
      <div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${Math.max(3, progresso?.percentual || 0)}%` }}
          />
        </div>
        <div className="mt-2 flex items-start justify-between gap-3 text-xs text-slate-500">
          <span className="min-w-0">{progresso?.texto || "Preparando…"}</span>
          <span className="flex-shrink-0 tabular-nums">{progresso?.percentual || 0}%</span>
        </div>
      </div>
      <ol className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        {["Extrair o texto dos PDFs", "Ler as partes com a IA", "Consolidar o resultado"].map(
          (rot, i) => (
            <li key={rot} className="flex items-center gap-2">
              {i < etapaIdx ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : i === etapaIdx ? (
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-slate-300" />
              )}
              <span className={i <= etapaIdx ? "text-slate-800" : "text-slate-400"}>{rot}</span>
            </li>
          )
        )}
      </ol>
    </div>
  );

  const hab = extraido?.habilitacao;
  const avisos = extraido?.avisos || [];
  const obs = extraido?.observacoes_importantes || [];
  const itensEdital = extraido?.itens || [];
  const gp = extraido?.garantia_proposta;

  const passoConferencia = extraido && (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <FileSearch className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <span>
          Confira os dados antes de salvar — a IA pode errar. {extraido.paginas_lidas || 0}{" "}
          página(s) lida(s) de {selecionados.length} arquivo(s).
          {existente && " Os campos em branco no edital mantêm o valor atual da oportunidade."}
        </span>
      </div>

      {avisos.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> Avisos da leitura
          </p>
          <ul className="list-disc space-y-1 pl-6 text-sm text-amber-900">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <Secao titulo="Identificação">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {renderCampoTexto("nome", "Título da oportunidade *", { col: "md:col-span-2" })}
          {renderCampoTexto("orgao", "Órgão", { col: "md:col-span-2" })}
          {renderCampoTexto("licitacao_numero", "Nº do edital")}
          {renderCampoTexto("licitacao_processo", "Nº do processo")}
          {renderSelect("licitacao_modalidade", "Modalidade", MODALIDADES_LICITACAO)}
          {renderSelect("licitacao_forma", "Forma", FORMAS)}
          {renderCampoTexto("licitacao_portal", "Portal / plataforma da disputa", {
            col: "md:col-span-2",
          })}
          <div>
            <Label htmlFor="le-valor_estimado">Valor estimado (R$)</Label>
            <div className="mt-1.5">
              <InputMoeda
                id="le-valor_estimado"
                value={campo("valor_estimado")}
                onChange={(v) => setCampo("valor_estimado", v)}
              />
            </div>
            {existente && (
              <DicaValor
                k="valor_estimado"
                ia={normalizarCampo("valor_estimado", camposIa.valor_estimado)}
                atual={normalizarCampo("valor_estimado", existente.valor_estimado)}
                valor={campo("valor_estimado")}
                onUsar={(v) => setCampo("valor_estimado", v)}
              />
            )}
          </div>
          {renderCampoTexto("licitacao_criterio_julgamento", "Critério de julgamento", {
            placeholder: "Ex.: menor preço global",
          })}
          {renderCampoTexto("licitacao_prazo_execucao", "Prazo de execução")}
          <div>
            <Label>Exclusiva ME/EPP</Label>
            <Select
              value={
                campo("licitacao_exclusiva_me_epp") === true
                  ? "sim"
                  : campo("licitacao_exclusiva_me_epp") === false
                    ? "nao"
                    : "nd"
              }
              onValueChange={(v) =>
                setCampo(
                  "licitacao_exclusiva_me_epp",
                  v === "sim" ? true : v === "nao" ? false : null
                )
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nd">Não informado</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
            {dicaValor("licitacao_exclusiva_me_epp")}
          </div>
        </div>
      </Secao>

      <Secao titulo="Prazos">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PRAZOS.map((p) => (
            <div key={p.data}>
              <Label className="flex items-center">
                {p.rotulo}
                <Pagina n={paginaDe(extraido, p.pag)} />
              </Label>
              <div className="mt-1.5 grid grid-cols-[1fr_120px] gap-2">
                <Input
                  type="date"
                  aria-label={`${p.rotulo} — data`}
                  value={campo(p.data) ?? ""}
                  onChange={(e) => setCampo(p.data, e.target.value)}
                />
                <Input
                  type="time"
                  aria-label={`${p.rotulo} — hora`}
                  value={campo(p.hora) ?? ""}
                  onChange={(e) => setCampo(p.hora, e.target.value)}
                />
              </div>
              {existente && (
                <>
                  <DicaValor
                    k={p.data}
                    ia={normalizarCampo(p.data, camposIa[p.data])}
                    atual={normalizarCampo(p.data, existente[p.data])}
                    valor={campo(p.data)}
                    onUsar={(v) => setCampo(p.data, v)}
                  />
                  <DicaValor
                    k={p.hora}
                    ia={normalizarCampo(p.hora, camposIa[p.hora])}
                    atual={normalizarCampo(p.hora, existente[p.hora])}
                    valor={campo(p.hora)}
                    onUsar={(v) => setCampo(p.hora, v)}
                  />
                </>
              )}
            </div>
          ))}
          {renderCampoTexto("licitacao_visita_tecnica", "Visita técnica", {
            col: "md:col-span-2",
            placeholder: "Obrigatória/facultativa, data, local",
            pag: paginaDe(extraido, "visita_tecnica"),
          })}
          <div className="md:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={campo("licitacao_garantia_proposta") === true}
                onCheckedChange={(v) => setCampo("licitacao_garantia_proposta", v === true)}
                className="border-slate-300 data-[state=checked]:border-amber-500 data-[state=checked]:bg-amber-500"
              />
              Exige garantia de proposta
              <Pagina n={paginaDe(extraido, "garantia")} />
            </label>
            {gp?.exigida && (gp.percentual != null || gp.valor != null) && (
              <p className="ml-6 mt-1 text-xs text-slate-500">
                {juntar(
                  gp.percentual != null && `${NUM.format(gp.percentual)}% do estimado`,
                  gp.valor != null && formatBRL(gp.valor)
                )}
              </p>
            )}
            {existente && <div className="ml-6">{dicaValor("licitacao_garantia_proposta")}</div>}
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-950">
          <Checkbox
            checked={alertarPrazos}
            onCheckedChange={(v) => setAlertarPrazos(v === true)}
            className="mt-0.5 border-amber-400 data-[state=checked]:border-amber-500 data-[state=checked]:bg-amber-500"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <Bell className="h-4 w-4 text-amber-600" /> Criar alertas de prazo (3, 1 e 0 dias
              antes)
            </span>
            <span className="text-xs text-amber-800">
              Os responsáveis e os administradores recebem aviso da impugnação, esclarecimentos,
              proposta e sessão.
            </span>
          </span>
        </label>
      </Secao>

      <Secao titulo="Local e objeto">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_110px]">
          {renderCampoTexto("cidade", "Cidade")}
          <div>
            <Label htmlFor="le-estado">UF</Label>
            <Input
              id="le-estado"
              maxLength={2}
              value={campo("estado") ?? ""}
              onChange={(e) => setCampo("estado", e.target.value.toUpperCase())}
              className="mt-1.5 uppercase"
            />
            {dicaValor("estado")}
          </div>
          {renderCampoTexto("endereco", "Endereço", { col: "md:col-span-2" })}
          <div className="md:col-span-2">
            <Label htmlFor="le-descricao">Objeto / descrição</Label>
            <Textarea
              id="le-descricao"
              rows={4}
              value={campo("descricao") ?? ""}
              onChange={(e) => setCampo("descricao", e.target.value)}
              className="mt-1.5"
            />
            {existente && (
              <DicaValor
                k="descricao"
                ia={normalizarCampo("descricao", camposIa.descricao)}
                atual={normalizarCampo("descricao", existente.descricao)}
                valor={campo("descricao")}
                onUsar={(v) => setCampo("descricao", v)}
              />
            )}
          </div>
        </div>
      </Secao>

      <Secao titulo="Habilitação exigida">
        <HabilitacaoExigida hab={hab} />
      </Secao>

      {(obs.length > 0 ||
        extraido.regime_execucao ||
        extraido.vigencia ||
        extraido.consorcio_permitido != null ||
        extraido.subcontratacao_permitida != null) && (
        <Secao titulo="Outras informações">
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {extraido.regime_execucao && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                Regime: {extraido.regime_execucao}
              </span>
            )}
            {extraido.vigencia && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                Vigência: {extraido.vigencia}
              </span>
            )}
            {extraido.consorcio_permitido != null && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                Consórcio: {extraido.consorcio_permitido ? "permitido" : "vedado"}
              </span>
            )}
            {extraido.subcontratacao_permitida != null && (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
                Subcontratação: {extraido.subcontratacao_permitida ? "permitida" : "vedada"}
              </span>
            )}
          </div>
          {obs.length > 0 && (
            <ul className="space-y-1.5 text-sm text-slate-700">
              {obs.map((o, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-amber-500" />
                  <span>
                    {o.texto}
                    <Pagina n={o.pagina} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}

      {itensEdital.length > 0 && (
        <details className="group rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700">
            Itens / lotes do edital ({itensEdital.length})
          </summary>
          <div className="max-h-80 overflow-auto border-t border-slate-100">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Lote</th>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd</th>
                  <th className="px-3 py-2 font-medium">Un</th>
                  <th className="px-3 py-2 text-right font-medium">Unitário</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {itensEdital.map((it, i) => (
                  <tr key={i} className="align-top">
                    <td className="px-3 py-1.5">{it.lote ?? ""}</td>
                    <td className="px-3 py-1.5">{it.item ?? ""}</td>
                    <td className="px-3 py-1.5">{it.descricao}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {numLegivel(it.quantidade)}
                    </td>
                    <td className="px-3 py-1.5">{it.unidade}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {brlLegivel(it.valor_unitario)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {brlLegivel(it.valor_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );

  const nomeSalvo = form.nome || existente?.nome || "";
  const passoAtende = (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-emerald-900">
            {existente ? "Oportunidade atualizada" : "Oportunidade criada"}
          </p>
          <p className="truncate text-emerald-800">{nomeSalvo}</p>
          <p className="mt-0.5 text-xs text-emerald-700">
            {analise?.arquivos?.length || 0} PDF(s) do edital anexado(s) · alertas de prazo{" "}
            {alertarPrazos ? "ligados" : "desligados"}
          </p>
        </div>
      </div>

      <h3 className="pt-2 text-base font-semibold text-slate-800">A empresa atende ao edital?</h3>

      {atendeStatus === "rodando" && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
          Conferindo as exigências com o acervo técnico da {empresa?.nome || "empresa"}…
        </div>
      )}
      {atendeStatus === "erro" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <XCircle className="h-4 w-4" /> Não foi possível conferir o acervo
          </p>
          <p className="mt-1 text-sm text-red-700">{atendeErro}</p>
          <p className="mt-1 text-xs text-red-600">
            A oportunidade e a leitura do edital já estão salvas.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => rodarAtende(opId, analise)}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Tentar de novo
          </Button>
        </div>
      )}
      {atendeStatus === "ok" && (
        <AtendeEdital analise={analise} onReanalisar={() => rodarAtende(opId, analise)} />
      )}
    </div>
  );

  let rodape = null;
  if (passo === "arquivos") {
    rodape = (
      <>
        <Button variant="outline" onClick={() => fechar(false)}>
          Cancelar
        </Button>
        <Button
          onClick={iniciarLeitura}
          disabled={!selecionados.length}
          className="bg-amber-500 hover:bg-amber-600"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Ler com IA{selecionados.length ? ` (${selecionados.length})` : ""}
        </Button>
      </>
    );
  } else if (passo === "leitura") {
    rodape = erroLeitura ? (
      <>
        <Button variant="outline" onClick={() => setPasso("arquivos")}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        <Button onClick={iniciarLeitura} className="bg-amber-500 hover:bg-amber-600">
          <RefreshCw className="mr-2 h-4 w-4" /> Tentar de novo
        </Button>
      </>
    ) : (
      <Button variant="outline" onClick={cancelarLeitura}>
        Cancelar leitura
      </Button>
    );
  } else if (passo === "conferencia") {
    rodape = (
      <>
        <Button
          variant="outline"
          disabled={salvando}
          onClick={() => {
            if (confirm("Voltar aos arquivos? A leitura atual será descartada.")) {
              setPasso("arquivos");
            }
          }}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Arquivos
        </Button>
        <Button onClick={salvar} disabled={salvando} className="bg-amber-500 hover:bg-amber-600">
          {salvando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {salvando ? etapaSalvar || "Salvando…" : "Salvar e conferir acervo"}
        </Button>
      </>
    );
  } else if (passo === "atende") {
    // abrir no meio do "Atende?" mostrava o detalhe sem o resultado (e convidava
    // a pagar outra análise): espera terminar
    const conferindo = atendeStatus === "rodando";
    rodape = (
      <Button
        onClick={abrirOportunidade}
        disabled={conferindo}
        className="bg-amber-500 hover:bg-amber-600"
      >
        {conferindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {conferindo ? "Conferindo o acervo…" : "Abrir oportunidade"}
      </Button>
    );
  }

  return (
    <Sheet open={open} onOpenChange={fechar}>
      <SheetContent side="right" className="flex h-full flex-col overflow-y-auto p-0">
        <div className="sticky top-0 z-10 flex-shrink-0 border-b bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                Ler edital com IA
              </SheetTitle>
              <SheetDescription className="truncate">
                {existente
                  ? `Atualizar "${existente.nome || existente.titulo || "oportunidade"}" com os dados do edital`
                  : "Crie a oportunidade a partir dos PDFs do edital"}
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => fechar(false)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {PASSOS.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                    i < indicePasso
                      ? "bg-emerald-500 text-white"
                      : i === indicePasso
                        ? "bg-amber-500 text-white"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {i < indicePasso ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span
                  className={i === indicePasso ? "font-medium text-slate-800" : "text-slate-500"}
                >
                  {p.rotulo}
                </span>
                {i < PASSOS.length - 1 && <span className="h-px w-6 bg-slate-200" />}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          <div className="mx-auto w-full max-w-5xl p-6">
            {passo === "arquivos" && passoArquivos}
            {passo === "leitura" && passoLeitura}
            {passo === "conferencia" && passoConferencia}
            {passo === "atende" && passoAtende}
          </div>
        </div>

        {rodape && (
          <div className="sticky bottom-0 z-10 flex flex-shrink-0 justify-end gap-3 border-t bg-white px-6 py-4">
            {rodape}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
