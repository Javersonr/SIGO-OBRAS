import React, { useMemo, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { matchBusca } from "@/lib/busca";
import { hojeEmBrasilia } from "@/lib/ead-vencimentos";
import {
  GRUPOS_DOCUMENTO,
  IDS_TIPO_DOCUMENTO,
  pacoteDoMes,
  rotuloDoTipo,
  tipoDocumento,
  versoesAnteriores,
} from "@/lib/habilitacao-documentos";
import AnexoViewer from "@/components/shared/AnexoViewer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { fmtData } from "./acervo-utils";
import { Aviso, SeloValidade } from "./AcervoUi";
import DocumentoHabilitacaoSheet from "./DocumentoHabilitacaoSheet";
import LembretesHabilitacao from "./LembretesHabilitacao";
import ModelosDeclaracao from "./ModelosDeclaracao";

const ordemDoTipo = (tipo) => {
  const i = IDS_TIPO_DOCUMENTO.indexOf(tipo);
  return i < 0 ? IDS_TIPO_DOCUMENTO.length : i;
};

const nomeDe = (doc) => String(doc?.nome ?? "");

/** Um item do pacote do mês: "<tipo> — <nome> (venceu em ...)" e o atalho para a versão nova. */
function ItemPacote({ doc, verbo, podeEditar, onNovaVersao }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="min-w-0 break-words">
        {rotuloDoTipo(doc.tipo)} — {doc.nome} ({verbo} {fmtData(doc.validade)})
      </span>
      {podeEditar && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 flex-shrink-0 bg-white px-2 text-xs"
          onClick={() => onNovaVersao(doc)}
        >
          Nova versão
        </Button>
      )}
    </li>
  );
}

/** Topo da aba: o que venceu e o que vence em 30 dias (só documentos ativos com validade). */
function PacoteDoMes({ pacote, haDocumentos, podeEditar, onNovaVersao }) {
  const { vencidos, vencem } = pacote;
  if (vencidos.length === 0 && vencem.length === 0) {
    if (!haDocumentos) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        Nenhum documento vencido nem vencendo nos próximos 30 dias.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {vencidos.length > 0 && (
        <Aviso cor="red" icon={Clock} titulo="Vencidos: renove antes da próxima licitação">
          <ul className="mt-1 space-y-1.5">
            {vencidos.map((d) => (
              <ItemPacote
                key={d.id}
                doc={d}
                verbo="venceu em"
                podeEditar={podeEditar}
                onNovaVersao={onNovaVersao}
              />
            ))}
          </ul>
        </Aviso>
      )}
      {vencem.length > 0 && (
        <Aviso cor="amber" icon={Clock} titulo="Vencem nos próximos 30 dias">
          <ul className="mt-1 space-y-1.5">
            {vencem.map((d) => (
              <ItemPacote
                key={d.id}
                doc={d}
                verbo="vence em"
                podeEditar={podeEditar}
                onNovaVersao={onNovaVersao}
              />
            ))}
          </ul>
        </Aviso>
      )}
    </div>
  );
}

/** Versão anterior de um documento: recuada, em cinza, com o arquivo e a validade. */
function LinhaVersao({ doc, onVer }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">
      <span className="min-w-0 break-words">
        {doc.nome}
        {doc.numero ? ` · nº ${doc.numero}` : ""}
        {" · "}
        {doc.validade ? `validade ${fmtData(doc.validade)}` : "sem validade"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-slate-600"
        disabled={!doc.arquivo_ref}
        onClick={() => onVer(doc)}
      >
        <Eye className="mr-1 h-3.5 w-3.5" /> Ver
      </Button>
    </li>
  );
}

/** Um documento ativo da biblioteca (e, se pedido, as versões que ele substituiu). */
function LinhaDocumento({
  doc,
  versoes,
  hoje,
  podeEditar,
  onVer,
  onNovaVersao,
  onEditar,
  onExcluir,
}) {
  const detalhes = [doc.numero ? `nº ${doc.numero}` : null, doc.orgao_emissor || null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="break-words text-sm">
            <span className="font-semibold text-slate-800">{rotuloDoTipo(doc.tipo)}</span>
            <span className="text-slate-600"> — {doc.nome}</span>
          </p>
          {detalhes && <p className="break-words text-xs text-slate-500">{detalhes}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {doc.emissao && <span>Emissão {fmtData(doc.emissao)}</span>}
            <SeloValidade validade={doc.validade} hoje={hoje} />
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={!doc.arquivo_ref}
            onClick={() => onVer(doc)}
          >
            <Eye className="mr-1.5 h-4 w-4" /> Ver
          </Button>
          {podeEditar && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => onNovaVersao(doc)}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Nova versão
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => onEditar(doc)}
              >
                <Pencil className="mr-1.5 h-4 w-4" /> Editar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-slate-500 hover:text-red-600"
                onClick={() => onExcluir(doc)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
              </Button>
            </>
          )}
        </div>
      </div>
      {versoes.length > 0 && (
        <ul className="ml-4 mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
          {versoes.map((v) => (
            <LinhaVersao key={v.id} doc={v} onVer={onVer} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Aba "Documentos e certidões": a biblioteca de documentos de habilitação da empresa (tabela
 * acervo_documento, 0159). O SIGO anexa estes arquivos às licitações; cada documento novo pode
 * substituir um anterior, que vai para o histórico.
 * podeEditar=false (padrão) → só leitura: sem cadastrar, editar, excluir nem versão nova.
 * erroCarga=true → a leitura da biblioteca falhou: a lista vazia NÃO quer dizer "sem documentos",
 * então a aba mostra o aviso de falha no lugar do vazio e esconde o cadastro e a busca.
 */
export default function DocumentosHabilitacao({
  documentos = [],
  empresaId,
  onRecarregar,
  podeEditar = false,
  erroCarga = false,
}) {
  const [busca, setBusca] = useState("");
  const [mostrarVersoes, setMostrarVersoes] = useState(false);
  const [gaveta, setGaveta] = useState(null); // { editar } | { substituir } | {} (novo) | null
  const [arquivoAberto, setArquivoAberto] = useState(null);
  const hoje = hojeEmBrasilia();

  const ativos = useMemo(() => documentos.filter((d) => d && d.ativo !== false), [documentos]);
  const pacote = useMemo(() => pacoteDoMes(documentos, hoje), [documentos, hoje]);

  // os ativos que passam na busca, em blocos por grupo (ordem dos tipos e depois o nome)
  const blocos = useMemo(() => {
    const visiveis = ativos
      .filter((d) => matchBusca(busca, d.nome, d.numero, d.orgao_emissor))
      .sort(
        (a, b) =>
          ordemDoTipo(a.tipo) - ordemDoTipo(b.tipo) || nomeDe(a).localeCompare(nomeDe(b), "pt-BR")
      );
    return GRUPOS_DOCUMENTO.map((g) => ({
      ...g,
      docs: visiveis.filter((d) => (tipoDocumento(d.tipo)?.grupo ?? "outro") === g.id),
    })).filter((b) => b.docs.length > 0);
  }, [ativos, busca]);

  const ver = (doc) => setArquivoAberto({ url: doc.arquivo_ref, nome: doc.nome });

  const excluir = async (doc) => {
    if (!podeEditar) return;
    // excluir a versão em vigor faz a anterior voltar a valer (o banco cuida disso, 0159)
    const anterior = doc.substitui_id
      ? documentos.find((d) => d?.id === doc.substitui_id)
      : undefined;
    const textoConfirmacao = anterior
      ? `Excluir esta versão? A versão anterior ("${nomeDe(anterior)}") volta a valer. As licitações já montadas não mudam.`
      : "Excluir este documento da biblioteca? O arquivo sai da lista, e as licitações já montadas não mudam.";
    if (!window.confirm(textoConfirmacao)) return;
    try {
      await sigo.entities.AcervoDocumento.delete(doc.id);
      toast.success(anterior ? "Versão excluída: a anterior voltou a valer" : "Documento excluído");
      onRecarregar?.();
    } catch (e) {
      console.error("[Habilitação] excluir:", e);
      toast.error("Erro ao excluir" + (e?.message ? `: ${e.message}` : ""));
    }
  };

  return (
    <div className="space-y-4">
      {!erroCarga && (
        <PacoteDoMes
          pacote={pacote}
          haDocumentos={ativos.length > 0}
          podeEditar={podeEditar}
          onNovaVersao={(doc) => setGaveta({ substituir: doc })}
        />
      )}

      {!erroCarga && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, número ou órgão emissor…"
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox
              checked={mostrarVersoes}
              onCheckedChange={(v) => setMostrarVersoes(v === true)}
            />
            Mostrar versões anteriores
          </label>
          {podeEditar && (
            <Button className="bg-amber-500 hover:bg-amber-600" onClick={() => setGaveta({})}>
              <Plus className="mr-1.5 h-4 w-4" /> Novo documento
            </Button>
          )}
        </div>
      )}

      {erroCarga ? (
        <Aviso cor="red" icon={AlertCircle} titulo="Não foi possível carregar os documentos">
          Use o botão Atualizar no topo da página. Se continuar, avise o suporte.
        </Aviso>
      ) : ativos.length === 0 ? (
        <div className="rounded-xl bg-slate-50 px-4 py-12 text-center">
          <FolderOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="mx-auto max-w-xl font-medium text-slate-500">
            Nenhum documento na biblioteca. Envie as certidões e os documentos da empresa para o
            SIGO anexar a habilitação das licitações sozinho.
          </p>
        </div>
      ) : blocos.length === 0 ? (
        <div className="rounded-xl bg-slate-50 py-10 text-center">
          <p className="font-medium text-slate-500">Nenhum documento com esses termos</p>
        </div>
      ) : (
        <div className="space-y-5">
          {blocos.map((bloco) => (
            <section key={bloco.id} className="space-y-2">
              <h3 className="border-b border-slate-200 pb-1 text-sm font-semibold text-slate-700">
                {bloco.titulo} ({bloco.docs.length})
              </h3>
              <ul className="space-y-2">
                {bloco.docs.map((doc) => (
                  <LinhaDocumento
                    key={doc.id}
                    doc={doc}
                    versoes={mostrarVersoes ? versoesAnteriores(doc, documentos) : []}
                    hoje={hoje}
                    podeEditar={podeEditar}
                    onVer={ver}
                    onNovaVersao={(d) => setGaveta({ substituir: d })}
                    onEditar={(d) => setGaveta({ editar: d })}
                    onExcluir={excluir}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Com a leitura da biblioteca em falha a aba mostra só o aviso de erro: sem o cartão de lembretes. */}
      {!erroCarga && <LembretesHabilitacao empresaId={empresaId} podeEditar={podeEditar} />}

      {/* Modelos de declaração (0161): some sozinho se a tabela ainda não existe; também fora do aviso de falha. */}
      {!erroCarga && <ModelosDeclaracao empresaId={empresaId} podeEditar={podeEditar} />}

      <DocumentoHabilitacaoSheet
        open={podeEditar && !!gaveta}
        onOpenChange={(v) => !v && setGaveta(null)}
        documento={gaveta?.editar || null}
        substituir={gaveta?.substituir || null}
        documentos={documentos}
        empresaId={empresaId}
        onSalvo={onRecarregar}
      />

      <AnexoViewer
        anexo={arquivoAberto}
        open={!!arquivoAberto}
        onOpenChange={(v) => !v && setArquivoAberto(null)}
      />
    </div>
  );
}
