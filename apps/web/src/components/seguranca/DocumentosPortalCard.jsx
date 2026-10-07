import React, { useEffect, useState } from "react";
import { sigo, supabase } from "@/api/sigoClient";
import { refDoUpload } from "@/lib/anexo-ref";
import {
  TIPOS_DOCUMENTO_PORTAL,
  listaAnexosRH,
  parametrosDaPublicacao,
  validarPdfPortal,
  retirarDocumentoPortal,
} from "@/lib/portal-documentos";
import AnexoViewer from "@/components/shared/AnexoViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Publicação explícita de PDFs pessoais, sem expor anexos internos do RH.
 *
 * T33 (B2): publicar e retirar passam pelas RPC `portal_documento_publicar` e `portal_documento_retirar` (migração
 * 0147), que conferem a permissão (Segurança do Trabalho → RH → Criar / Deletar), montam o item no banco e gravam
 * num UPDATE só. A tela não grava mais `documentos_rh_anexos` (o banco recusa mudar só os itens do portal pela API).
 * `podePublicar` e `podeRetirar` só escondem os botões: quem confere é o banco.
 */
export default function DocumentosPortalCard({
  funcionario,
  empresaAtiva,
  onSalvo,
  podePublicar = false,
  podeRetirar = false,
}) {
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
      .select("documentos_rh_anexos")
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

  const enviar = async () => {
    if (!podePublicar) return;
    const mensagem = validarPdfPortal(arquivo, tipo, competencia);
    if (mensagem) return toast.error(mensagem);
    setOcupado(true);
    setErro("");
    try {
      if (!(await arquivo.slice(0, 1024).text()).includes("%PDF-"))
        throw new Error("O arquivo escolhido não é um PDF válido");
      // o banco só aceita publicar um PDF de verdade (mimetype do Storage): o conteúdo já foi conferido acima
      const upload = await sigo.integrations.Core.UploadFile({
        file: arquivo,
        bucket: "contratacao",
        mimeType: "application/pdf",
      });
      const ref = refDoUpload(upload);
      if (!ref?.startsWith(`contratacao/${empresaAtiva.id}/`))
        throw new Error("A empresa do upload não corresponde à ficha aberta");
      const { error } = await supabase.rpc(
        "portal_documento_publicar",
        parametrosDaPublicacao({
          funcionarioId: funcionario.id,
          tipo,
          competencia,
          ref,
          nomeArquivo: arquivo.name,
        })
      );
      if (error) throw error;
      await buscar();
      onSalvo?.();
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
    if (!podeRetirar) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("portal_documento_retirar", {
        p_funcionario_id: funcionario.id,
        p_documento_id: id,
      });
      if (error) throw error;
      setDocumentos((lista) => retirarDocumentoPortal(lista, id, funcionario.id));
      onSalvo?.();
      toast.success(
        data === false
          ? "O documento já tinha sido retirado do portal"
          : "Documento retirado do portal"
      );
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
      {podePublicar ? (
        <>
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
        </>
      ) : (
        <p className="text-xs text-slate-500">
          Publicar PDF no portal exige a permissão Segurança do Trabalho → RH → Criar.
        </p>
      )}
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
            {podeRetirar && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Retirar ${doc.nome_arquivo} do portal`}
                disabled={ocupado}
                onClick={() => retirar(doc.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
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
