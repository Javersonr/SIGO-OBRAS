import React, { useEffect, useState } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { refDoUpload } from "@/lib/anexo-ref";
import {
  TIPOS_DOCUMENTO_PORTAL,
  listaAnexosRH,
  validarPdfPortal,
  retirarDocumentoPortal,
} from "@/lib/portal-documentos";
import AnexoViewer from "@/components/shared/AnexoViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

/** Publicação explícita de PDFs pessoais, sem expor anexos internos do RH. */
export default function DocumentosPortalCard({ funcionario, empresaAtiva, onSalvo }) {
  const [documentos, setDocumentos] = useState([]);
  const [tipo, setTipo] = useState("documentacao");
  const [competencia, setCompetencia] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(null);
  const [arquivoVersao, setArquivoVersao] = useState(0);

  const buscar = async () => {
    const { data, error } = await supabase
      .from("funcionario")
      .select("documentos_rh_anexos, updated_at")
      .eq("id", funcionario.id)
      .eq("empresa_id", empresaAtiva.id)
      .is("deleted_at", null)
      .single();
    if (error) throw error;
    setDocumentos(listaAnexosRH(data.documentos_rh_anexos));
    return data;
  };
  useEffect(() => {
    let ativo = true;
    buscar()
      .catch(() => {
        if (ativo) setErro("Não foi possível carregar os documentos");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [funcionario.id, empresaAtiva.id]);

  const gravar = async (atual, anexos) => {
    // Não sobrescreve alterações feitas por outra tela/sessão durante o upload.
    let query = supabase
      .from("funcionario")
      .update({ documentos_rh_anexos: anexos })
      .eq("id", funcionario.id)
      .eq("empresa_id", empresaAtiva.id)
      .is("deleted_at", null);
    query = atual.updated_at
      ? query.eq("updated_at", atual.updated_at)
      : query.is("updated_at", null);
    const { data, error } = await query.select("id");
    if (error) throw error;
    if (!data?.length)
      throw new Error("O cadastro mudou durante o envio. Atualize a ficha e tente novamente.");
    setDocumentos(anexos);
    onSalvo?.();
  };

  const enviar = async () => {
    const mensagem = validarPdfPortal(arquivo, tipo, competencia);
    if (mensagem) return toast.error(mensagem);
    setOcupado(true);
    setErro("");
    try {
      if (!(await arquivo.slice(0, 1024).text()).includes("%PDF-"))
        throw new Error("O arquivo escolhido não é um PDF válido");
      const atual = await buscar();
      const upload = await sigo.integrations.Core.UploadFile({
        file: arquivo,
        bucket: "contratacao",
      });
      const ref = refDoUpload(upload);
      if (!ref?.startsWith(`contratacao/${empresaAtiva.id}/`))
        throw new Error("A empresa do upload não corresponde à ficha aberta");
      const novo = {
        id: crypto.randomUUID(),
        origem: "portal_funcionario",
        funcionario_id: funcionario.id,
        publicado: true,
        tipo,
        competencia: tipo === "documentacao" ? null : competencia,
        nome_arquivo: arquivo.name,
        url: ref,
        data_upload: new Date().toISOString(),
      };
      await gravar(atual, [...listaAnexosRH(atual.documentos_rh_anexos), novo]);
      setArquivo(null);
      setArquivoVersao((v) => v + 1);
      toast.success("PDF disponível no portal do funcionário");
    } catch (e) {
      toast.error(e.message || "Não foi possível enviar o documento");
    } finally {
      setOcupado(false);
    }
  };

  const retirar = async (id) => {
    setOcupado(true);
    try {
      const atual = await buscar();
      await gravar(
        atual,
        retirarDocumentoPortal(listaAnexosRH(atual.documentos_rh_anexos), id, funcionario.id)
      );
      toast.success("Documento retirado do portal");
    } catch (e) {
      toast.error(e.message || "Não foi possível retirar o documento");
    } finally {
      setOcupado(false);
    }
  };

  const visiveis = documentos.filter(
    (d) =>
      d?.origem === "portal_funcionario" &&
      d.funcionario_id === funcionario.id &&
      d.publicado === true
  );
  return (
    <section className="rounded-lg border p-3 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <FileText className="w-4 h-4" /> PDFs do Portal do Funcionário
      </h3>
      <p className="text-xs text-slate-500">
        Envie documentação, contracheques e folhas de ponto. O arquivo fica disponível somente no
        portal deste funcionário.
      </p>
      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="portal-doc-tipo">Tipo de documento</Label>
          <select
            id="portal-doc-tipo"
            value={tipo}
            disabled={ocupado}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full h-10 rounded-md border px-2 bg-white"
          >
            {Object.entries(TIPOS_DOCUMENTO_PORTAL).map(([valor, nome]) => (
              <option key={valor} value={valor}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        {tipo !== "documentacao" && (
          <div>
            <Label htmlFor="portal-doc-competencia">Competência</Label>
            <Input
              id="portal-doc-competencia"
              type="month"
              value={competencia}
              disabled={ocupado}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
        )}
      </div>
      <Label htmlFor="portal-doc-arquivo">Arquivo PDF (até 20 MB)</Label>
      <Input
        key={arquivoVersao}
        id="portal-doc-arquivo"
        type="file"
        accept="application/pdf,.pdf"
        disabled={ocupado}
        onChange={(e) => setArquivo(e.target.files?.[0] || null)}
      />
      <Button onClick={enviar} disabled={ocupado || carregando || !arquivo} className="w-full">
        {ocupado ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Upload className="w-4 h-4 mr-2" />
        )}{" "}
        Enviar ao portal
      </Button>
      {carregando ? (
        <p className="text-sm text-slate-500">Carregando documentos...</p>
      ) : visiveis.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum PDF enviado ao portal.</p>
      ) : (
        visiveis.map((doc) => (
          <div key={doc.id} className="flex items-center gap-2 border rounded-md p-2">
            <button
              onClick={() => setAberto(doc)}
              className="flex-1 min-w-0 text-left text-sm text-sky-700"
            >
              <span className="block truncate">{doc.nome_arquivo}</span>
              <span className="text-xs text-slate-500">
                {TIPOS_DOCUMENTO_PORTAL[doc.tipo]}
                {doc.competencia ? ` · ${doc.competencia.split("-").reverse().join("/")}` : ""}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Retirar ${doc.nome_arquivo} do portal`}
              disabled={ocupado}
              onClick={() => retirar(doc.id)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))
      )}
      <AnexoViewer
        open={!!aberto}
        onOpenChange={(v) => !v && setAberto(null)}
        anexo={aberto ? { url: aberto.url, nome: aberto.nome_arquivo } : null}
      />
    </section>
  );
}
