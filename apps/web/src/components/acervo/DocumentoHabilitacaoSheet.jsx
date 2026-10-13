import React, { useEffect, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { refDoUpload, nomeDoArquivo } from "@/lib/anexo-ref";
import { hojeEmBrasilia } from "@/lib/ead-vencimentos";
import {
  GRUPOS_DOCUMENTO,
  TIPOS_DOCUMENTO,
  mensagemDeErroAoSalvar,
  substituidoPadrao,
  tipoDocumento,
  validarDocumento,
} from "@/lib/habilitacao-documentos";
import AnexoViewer from "@/components/shared/AnexoViewer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Loader2, Upload } from "lucide-react";
import { fmtData } from "./acervo-utils";
import { SeloValidade } from "./AcervoUi";

export const BUCKET_HABILITACAO = "habilitacao";
export const LIMITE_HABILITACAO = 50 * 1024 * 1024; // limite do bucket "habilitacao" (0154)

const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png"];
const SEM_SUBSTITUICAO = "__nenhum";

const VAZIO = {
  tipo: "",
  nome: "",
  arquivo_ref: "",
  numero: "",
  orgao_emissor: "",
  emissao: "",
  validade: "",
  observacao: "",
  substitui_id: "",
};

// o input type="date" só aceita AAAA-MM-DD
const dia = (v) => (v ? String(v).slice(0, 10) : "");

/** Editar: os campos do documento. Nova versão: tipo e nome do anterior, o resto vazio. Novo: tudo vazio. */
function paraForm(documento, substituir) {
  if (documento?.id) {
    return {
      tipo: documento.tipo || "",
      nome: documento.nome || "",
      arquivo_ref: documento.arquivo_ref || "",
      numero: documento.numero || "",
      orgao_emissor: documento.orgao_emissor || "",
      emissao: dia(documento.emissao),
      validade: dia(documento.validade),
      observacao: documento.observacao || "",
      substitui_id: documento.substitui_id || "",
    };
  }
  if (substituir?.id) {
    return {
      ...VAZIO,
      tipo: substituir.tipo || "",
      nome: substituir.nome || "",
      substitui_id: substituir.id,
    };
  }
  return { ...VAZIO };
}

/**
 * Cadastrar, editar ou criar a versão nova de um documento da biblioteca de habilitação.
 *  - documento: o que se edita (null = novo); o tipo e a cadeia de versões não mudam na edição;
 *  - substituir: o documento que a versão nova substitui (null fora do fluxo "Nova versão");
 *  - documentos: todos os da empresa, para sugerir o que a versão nova substitui.
 */
export default function DocumentoHabilitacaoSheet({
  open,
  onOpenChange,
  documento,
  substituir,
  documentos = [],
  empresaId,
  onSalvo,
}) {
  const [form, setForm] = useState(() => paraForm(documento, substituir));
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [verArquivo, setVerArquivo] = useState(false);
  const inputArquivo = useRef(null);
  const hoje = hojeEmBrasilia();

  // (re)carrega o formulário a cada abertura
  useEffect(() => {
    if (!open) return;
    setForm(paraForm(documento, substituir));
    setVerArquivo(false);
  }, [open, documento, substituir]);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const editando = !!documento?.id;
  const novaVersao = !editando && !!substituir;
  const novo = !editando && !novaVersao;
  const tipo = tipoDocumento(form.tipo);

  // documento novo: o tipo sugere o que ele substitui
  const escolherTipo = (id) =>
    setForm((f) => ({ ...f, tipo: id, substitui_id: substituidoPadrao(id, documentos) || "" }));

  // ativos do mesmo tipo: o que um documento novo pode substituir
  const candidatos =
    novo && tipo ? documentos.filter((d) => d && d.tipo === form.tipo && d.ativo !== false) : [];
  // tipo que admite vários em vigor (ou único com mais de um ativo): não há sugestão sozinha, a pessoa escolhe
  const escolhaLivre = candidatos.length > 0 && (!tipo.unico || candidatos.length > 1);
  const anterior = form.substitui_id ? documentos.find((d) => d?.id === form.substitui_id) : null;

  const enviarArquivo = async (file) => {
    if (!file) return;
    if (file.size > LIMITE_HABILITACAO) {
      toast.error("Arquivo acima de 50 MB");
      return;
    }
    if (!TIPOS_ACEITOS.includes(file.type)) {
      toast.error("Envie PDF, JPG ou PNG");
      return;
    }
    setEnviando(true);
    try {
      // grava a referência "bucket/caminho" (a URL assinada expira)
      const ref = refDoUpload(
        await sigo.integrations.Core.UploadFile({ file, bucket: BUCKET_HABILITACAO })
      );
      if (!ref) throw new Error("Upload sem referência");
      setForm((f) => ({
        ...f,
        arquivo_ref: ref,
        nome: f.nome || file.name.replace(/\.[^.]+$/, ""),
      }));
      toast.success("Arquivo anexado — salve para gravar");
    } catch (e) {
      console.error("[Habilitação] upload:", e);
      toast.error("Erro ao enviar o arquivo" + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setEnviando(false);
      if (inputArquivo.current) inputArquivo.current.value = "";
    }
  };

  const salvar = async () => {
    const v = validarDocumento(form);
    if (!v.ok) {
      toast.error(v.erros.join(". "));
      return;
    }
    setSalvando(true);
    try {
      if (documento?.id) {
        // editar não troca o tipo nem a cadeia de versões
        const { tipo: _tipo, ...dados } = v.dados;
        await sigo.entities.AcervoDocumento.update(documento.id, dados);
      } else {
        await sigo.entities.AcervoDocumento.create({
          ...v.dados,
          empresa_id: empresaId,
          substitui_id: form.substitui_id || null,
        });
      }
      toast.success(documento?.id ? "Documento atualizado" : "Documento gravado");
      onSalvo?.();
      onOpenChange(false);
    } catch (e) {
      console.error("[Habilitação] salvar:", e);
      toast.error(mensagemDeErroAoSalvar(e));
    } finally {
      setSalvando(false);
    }
  };

  const titulo = editando
    ? `Editar ${documento.nome}`
    : novaVersao
      ? `Nova versão de ${substituir.nome}`
      : "Novo documento";

  return (
    // sem fechar durante o envio nem a gravação: o resultado de um envio antigo cairia num formulário novo
    <Sheet open={open} onOpenChange={(v) => !salvando && !enviando && onOpenChange(v)}>
      <SheetContent className="flex flex-col gap-0 p-0">
        <SheetHeader className="flex-shrink-0 border-b px-6 py-4">
          <SheetTitle>{titulo}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-slate-600">Tipo *</Label>
              <Select value={form.tipo} onValueChange={escolherTipo} disabled={!novo}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o tipo" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {GRUPOS_DOCUMENTO.map((g) => (
                    <SelectGroup key={g.id}>
                      <SelectLabel className="text-xs text-slate-500">{g.titulo}</SelectLabel>
                      {TIPOS_DOCUMENTO.filter((t) => t.grupo === g.id).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.rotulo}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {!editando && !escolhaLivre && form.substitui_id && (
                <p className="text-xs text-slate-600">
                  {`Substitui "${anterior?.nome ?? "o documento anterior"}" (ele vai para o histórico).`}{" "}
                  {novo && (
                    <button
                      type="button"
                      className="font-medium text-amber-700 hover:underline"
                      onClick={() => set("substitui_id", "")}
                    >
                      Não substituir
                    </button>
                  )}
                </p>
              )}
            </div>

            {escolhaLivre && (
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs text-slate-600">Substitui</Label>
                <Select
                  value={form.substitui_id || SEM_SUBSTITUICAO}
                  onValueChange={(v) => set("substitui_id", v === SEM_SUBSTITUICAO ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    <SelectItem value={SEM_SUBSTITUICAO}>Nenhum (documento novo)</SelectItem>
                    {candidatos.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nome}
                        {d.validade ? ` — validade ${fmtData(d.validade)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-slate-600">Nome *</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Número</Label>
              <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Órgão emissor</Label>
              <Input
                value={form.orgao_emissor}
                onChange={(e) => set("orgao_emissor", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Emissão</Label>
              <Input
                type="date"
                value={form.emissao}
                onChange={(e) => set("emissao", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">Validade</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="min-w-0 flex-1"
                  value={form.validade}
                  onChange={(e) => set("validade", e.target.value)}
                />
                <SeloValidade validade={form.validade} hoje={hoje} />
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-slate-600">Observação</Label>
              <Textarea
                rows={2}
                value={form.observacao}
                onChange={(e) => set("observacao", e.target.value)}
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs text-slate-600">Arquivo *</Label>
              <div className="flex flex-wrap items-center gap-2">
                {form.arquivo_ref ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVerArquivo(true)}
                  >
                    <FileText className="mr-1.5 h-4 w-4" />
                    {nomeDoArquivo(form.arquivo_ref, "Abrir arquivo")}
                  </Button>
                ) : (
                  <span className="text-sm text-slate-500">Nenhum arquivo anexado.</span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={enviando}
                  onClick={() => inputArquivo.current?.click()}
                >
                  {enviando ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-4 w-4" />
                  )}
                  {form.arquivo_ref ? "Substituir" : "Enviar arquivo"}
                </Button>
                <input
                  ref={inputArquivo}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => enviarArquivo(e.target.files?.[0])}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 justify-end gap-3 border-t px-6 py-4">
          <Button
            variant="outline"
            disabled={salvando || enviando}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600"
            disabled={salvando || enviando}
            onClick={salvar}
          >
            {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        <AnexoViewer
          anexo={{ url: form.arquivo_ref, nome: nomeDoArquivo(form.arquivo_ref, "Documento") }}
          open={verArquivo && !!form.arquivo_ref}
          onOpenChange={setVerArquivo}
        />
      </SheetContent>
    </Sheet>
  );
}
