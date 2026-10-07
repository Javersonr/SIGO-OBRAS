import React, { useState } from "react";
import { sigo } from "@/api/sigoClient";
import ImgStorage from "@/components/ImgStorage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { refDoUpload } from "@/lib/anexo-ref";
import {
  ACCEPT_ASSINATURA,
  BUCKET_ASSINATURAS,
  nomeParaEnvio,
  refDeAssinatura,
  validarImagemAssinatura,
} from "@/lib/ead-assinatura";

/**
 * Imagem da assinatura do instrutor ou do responsável técnico do curso EAD (T29, decisão D7: vale a
 * imagem, não ICP-Brasil). O arquivo sobe para o bucket `assinaturas` e o curso guarda a REFERÊNCIA
 * "assinaturas/<empresa>/..." (nunca a URL assinada); o certificado copia essa referência na emissão.
 *
 * `valor` é a referência do curso; `onChange(ref)` recebe a referência nova, ou null ao remover, e pode devolver
 * `{ aplicada, aviso }` (a tela descarta a imagem se o RH abriu outro curso ou trocou quem assina durante o
 * envio). A troca só vale depois de "Salvar curso". Remover não apaga o arquivo do Storage: certificado já emitido guarda a
 * referência e continua desenhando a imagem. Referência antiga (Base44, arquivo perdido) não aparece como
 * imagem: o RH vê o aviso e anexa de novo.
 */
export default function AssinaturaCursoCampo({ rotulo, valor, empresaId, onChange }) {
  const [enviando, setEnviando] = useState(false);
  const ref = refDeAssinatura(valor, empresaId);

  const enviar = async (arquivo) => {
    const conferido = validarImagemAssinatura(arquivo);
    if (!conferido.ok) {
      toast.error(conferido.erro);
      return;
    }
    setEnviando(true);
    try {
      const res = await sigo.integrations.Core.UploadFile({
        file: arquivo,
        fileName: nomeParaEnvio(arquivo),
        bucket: BUCKET_ASSINATURAS,
      });
      const nova = refDoUpload(res);
      if (!refDeAssinatura(nova, empresaId)) {
        throw new Error("o arquivo não ficou numa referência válida da empresa");
      }
      // a tela devolve se a imagem entrou: descartada (outro curso aberto, outra pessoa no campo) não é sucesso
      const resultado = onChange(nova);
      if (resultado && resultado.aplicada === false) {
        toast.warning(resultado.aviso, { duration: 8000 });
      } else {
        toast.success("Imagem anexada. Salve o curso para guardá-la.");
      }
    } catch (e) {
      toast.error("Erro ao enviar a imagem: " + (e?.message || e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="col-span-2 flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="flex-1 min-w-[12rem]">
        <Label className="text-xs">{rotulo}</Label>
        <p className="text-xs text-slate-500 mt-0.5">
          Imagem PNG ou JPEG (até 2 MB), com fundo claro. Sem imagem, o certificado sai só com o
          nome e o registro.
        </p>
        {valor && !ref && (
          <p role="status" className="text-xs text-amber-700 mt-1">
            A imagem que estava aqui é do sistema antigo e não existe mais. Anexe de novo.
          </p>
        )}
      </div>
      {ref && (
        <ImgStorage
          referencia={ref}
          alt={rotulo}
          className="h-12 max-w-[10rem] rounded border bg-white object-contain"
        />
      )}
      <label className="text-xs border rounded-md px-2 py-1 cursor-pointer hover:border-slate-400 flex items-center gap-1">
        {enviando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        {ref ? "Trocar imagem" : "Anexar imagem"}
        <input
          type="file"
          accept={ACCEPT_ASSINATURA}
          className="hidden"
          disabled={enviando}
          aria-label={`Anexar imagem: ${rotulo}`}
          onChange={(e) => {
            enviar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {valor && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remover imagem: ${rotulo}`}
          title="Remover do curso (os certificados já emitidos continuam com a imagem)"
          onClick={() => onChange(null)}
          className="text-red-500 hover:text-red-700"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
