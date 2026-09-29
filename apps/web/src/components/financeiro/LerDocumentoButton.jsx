import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileSearch, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sigo } from "@/api/sigoClient";
import { refDoUpload } from "@/lib/anexo-ref";
import { lerXmlFiscal, textoDoXml } from "@/lib/nfe-xml";
import {
  ACEITAR_DOCUMENTO,
  classificarArquivo,
  formatarCpfCnpj,
  listaConferir,
} from "@/lib/ler-documento";

/**
 * "Ler documento" do Financeiro (nova despesa / nova receita).
 *
 *   - XML (NF-e, NFC-e, NFS-e): lido aqui no navegador (lerXmlFiscal, sem IA)
 *     e guardado como anexo no bucket nfe-xml;
 *   - PDF ou foto: sobe no bucket comprovantes e a ia-processar
 *     (acao "financeiro_ler_documento") devolve o DocumentoFiscal.
 *
 * O arquivo sobe UMA vez e vira o anexo. Nada é salvo aqui: a tela recebe
 * onLido({ documento, anexo: { nome, url: ref "bucket/path", tipo } }) e
 * preenche o formulário para o usuário conferir. Erro → toast; o formulário
 * fica como estava.
 *
 * @param {{ tipo: "despesa" | "receita", onLido: Function, disabled?: boolean, className?: string }} props
 */
export default function LerDocumentoButton({ tipo, onLido, disabled, className }) {
  const inputRef = useRef(null);
  const [etapa, setEtapa] = useState(null); // null | "enviando" | "lendo"

  // A leitura pode durar até ~2 min. Se a tela (o formulário) fechar nesse meio tempo, o botão
  // desmonta e o resultado é descartado: onLido usa os setters do PAI, que continuam valendo e
  // aplicariam o documento no lançamento que estiver aberto depois. O useEffect marca true de
  // novo ao montar porque o StrictMode (dev) monta, desmonta e monta o componente.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const enviar = async (arquivo, destino) => {
    setEtapa("enviando");
    const ref = refDoUpload(
      await sigo.integrations.Core.UploadFile({
        file: arquivo,
        fileName: destino.nomeArquivo,
        mimeType: destino.mimeType,
        bucket: destino.bucket,
      })
    );
    if (!ref) throw new Error("o arquivo não foi enviado, tente de novo");
    return ref;
  };

  const ler = async (arquivo) => {
    const destino = classificarArquivo(arquivo);
    if (!destino.ok) {
      toast.error(destino.erro);
      return;
    }
    let documento;
    let ref;
    try {
      if (destino.modo === "xml") {
        documento = lerXmlFiscal(await textoDoXml(arquivo));
        if (!documento) {
          toast.error("XML não reconhecido — envie o XML de uma NF-e, NFC-e ou NFS-e.");
          return;
        }
        ref = await enviar(arquivo, destino);
      } else {
        ref = await enviar(arquivo, destino);
        setEtapa("lendo");
        const { data } = await sigo.functions.invoke("iaProcessar", {
          acao: "financeiro_ler_documento",
          file_ref: ref,
          tipo,
        });
        if (data?.success === false) throw new Error(data.error || "IA indisponível");
        documento = data?.documento;
        if (!documento) throw new Error("a leitura não devolveu os dados");
      }
    } catch (err) {
      // tela já fechada: ninguém está esperando este aviso
      if (vivo.current) {
        toast.error("Não foi possível ler o documento: " + (err?.message || "tente de novo"));
      }
      return;
    } finally {
      if (vivo.current) setEtapa(null);
    }

    // Fora do try da leitura: um erro no preenchimento do pai não vira "Não foi possível ler o
    // documento", e sem este try/catch ele sumiria como promessa rejeitada sem aviso ao usuário.
    // (O arquivo que já subiu fica sem uso no Storage quando a leitura é descartada.)
    if (!vivo.current) return;
    try {
      onLido({ documento, anexo: { nome: arquivo.name, url: ref, tipo: destino.mimeType } });
    } catch (err) {
      console.error("[LerDocumentoButton] erro ao preencher o formulário:", err);
      toast.error("Não foi possível preencher o formulário: " + (err?.message || "tente de novo"));
      return;
    }
    toast.success("Documento lido — confira os campos antes de salvar.");
  };

  const ocupado = etapa !== null;
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACEITAR_DOCUMENTO}
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = ""; // deixa escolher o mesmo arquivo de novo
          if (arquivo) ler(arquivo);
        }}
      />
      <Button
        type="button"
        variant="outline"
        className={className}
        disabled={disabled || ocupado}
        onClick={() => inputRef.current?.click()}
        title="XML da nota (sem IA), PDF ou foto: DANFE, NFS-e, cupom, recibo, boleto, PIX"
      >
        {ocupado ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <FileSearch className="w-4 h-4 mr-2" />
        )}
        {etapa === "lendo"
          ? "Lendo documento…"
          : etapa === "enviando"
            ? "Enviando arquivo…"
            : "Ler documento (XML, PDF ou foto)"}
      </Button>
    </>
  );
}

/** Aviso "Confira os campos destacados": campos lidos com dúvida + avisos da leitura. */
export function ConferirLeitura({ duvidosos, avisos }) {
  const { campos, avisos: textos } = listaConferir(duvidosos, avisos);
  if (campos.length === 0 && textos.length === 0) return null;
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
      <p className="font-semibold flex items-center gap-1">
        <AlertTriangle className="w-4 h-4" />
        Confira os campos destacados
      </p>
      {campos.length > 0 && <p className="mt-1">Lidos com dúvida: {campos.join(", ")}.</p>}
      {textos.length > 0 && (
        <ul className="mt-1 list-disc pl-5 space-y-0.5">
          {textos.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Faixa "Fornecedor/Cliente não cadastrado: NOME (CNPJ) [Cadastrar]". */
export function PessoaNaoCadastrada({ rotulo, pessoa, onCadastrar }) {
  if (!pessoa) return null;
  return (
    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm flex items-center justify-between gap-2">
      <span className="text-amber-800 min-w-0">
        {rotulo} não cadastrado: <strong>{pessoa.nome || "sem nome"}</strong>
        {pessoa.documento ? ` (${formatarCpfCnpj(pessoa.documento)})` : ""}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
        onClick={onCadastrar}
      >
        <UserPlus className="w-4 h-4 mr-1" />
        Cadastrar
      </Button>
    </div>
  );
}
