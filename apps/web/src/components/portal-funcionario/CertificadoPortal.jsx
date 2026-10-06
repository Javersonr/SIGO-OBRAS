import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Award, Loader2, FileDown, PenLine } from "lucide-react";
import { apiPortal, fmtData } from "./api";
import { baixarCertificadoPdf } from "@/lib/certificado-ead";
import { AVISO_SEM_LOGO, mensagemFalhaCertificado } from "@/lib/certificado-ead-falhas";
import { logoParaPdfDeUrl } from "@/lib/pdf-empresa";
import {
  assinaturasQueFaltaram,
  avisoAssinaturasNaoCarregadas,
  carregarAssinaturasDoCertificado,
} from "@/lib/ead-assinatura";
import { MSG_CURSO_DE_APOIO, cursoDeApoio } from "@/lib/portal-curso";

/**
 * Certificado do curso concluído. Emitir = ASSINAR: o funcionário confirma a
 * declaração digitando a própria senha, e o servidor registra quando e de onde.
 * `empresaLogoUrl` = URL do logo já assinada pelo servidor (`dados.empresa_logo_url`), para o PDF
 * sair igual ao que o RH baixa; null = a empresa não tem logo que o portal consiga mostrar.
 * As imagens da assinatura do instrutor e do RT vêm assinadas em `cert.dados` (`assinatura_url`, T29); a
 * referência do Storage não sai do servidor. Sem imagem (ou se ela não carregar) o PDF sai só com nome e registro.
 * `api` é injetada (padrão: o portal de verdade); a prévia do RT nunca chega aqui (não há certificado).
 */
export default function CertificadoPortal({
  item,
  token,
  empresaLogoUrl = null,
  evento,
  recarregar,
  tratarErro,
  api = apiPortal,
}) {
  const { chamarPortal } = api;
  const cert = item.certificado;
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [assinando, setAssinando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  // falha ao gerar o PDF (aluno precisa ler) e aviso de PDF que saiu sem o logotipo
  const [erroPdf, setErroPdf] = useState("");
  const [avisoPdf, setAvisoPdf] = useState("");
  const [avisoAssinaturas, setAvisoAssinaturas] = useState("");

  const assinar = async (e) => {
    e.preventDefault();
    setErro("");
    setAssinando(true);
    try {
      await chamarPortal("certificado", { matricula_id: item.matricula.id, senha }, token);
      setSenha("");
      await recarregar();
    } catch (err) {
      if (err.codigo === "SESSAO" || err.codigo === "TROCAR_SENHA") tratarErro(err);
      else setErro(err.message);
    } finally {
      setAssinando(false);
    }
  };

  const baixar = async () => {
    setErroPdf("");
    setAvisoPdf("");
    setAvisoAssinaturas("");
    setBaixando(true);
    try {
      // sem logo carregado o PDF sai sem ele (o aluno é avisado abaixo); o QR, não: falha = erro
      const logo = await logoParaPdfDeUrl(empresaLogoUrl);
      // assinatura que não carrega também só gera aviso: o PDF sai com nome e registro (T29)
      const carregadas = await carregarAssinaturasDoCertificado(cert.dados, {
        urlDe: (pessoa) => pessoa.assinatura_url,
        carregar: logoParaPdfDeUrl,
      });
      const { logoDesenhado, assinaturasDesenhadas } = await baixarCertificadoPdf(cert, {
        logo,
        assinaturas: carregadas.imagens,
      });
      // a trilha só registra "Baixou o certificado" quando o PDF de fato saiu
      evento("abrir_certificado");
      if (empresaLogoUrl && !logoDesenhado) setAvisoPdf(AVISO_SEM_LOGO);
      setAvisoAssinaturas(
        avisoAssinaturasNaoCarregadas(assinaturasQueFaltaram(carregadas, assinaturasDesenhadas))
      );
    } catch (e) {
      console.error("[certificado] falha ao baixar:", e);
      setErroPdf(mensagemFalhaCertificado(e));
    } finally {
      setBaixando(false);
    }
  };

  if (cert) {
    return (
      <div
        className={`rounded-lg border p-4 space-y-2 ${
          cert.revogado ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"
        }`}
      >
        <p className="font-semibold flex items-center gap-2 text-slate-800">
          <Award className="w-5 h-5 text-emerald-600" /> Certificado emitido
        </p>
        {cert.revogado && (
          <p className="text-sm text-red-700 font-medium">
            Este certificado foi revogado pela empresa. Procure o RH.
          </p>
        )}
        <p className="text-sm text-slate-600">
          Código de autenticidade <span className="font-mono font-semibold">{cert.codigo}</span> ·
          conclusão em {fmtData(cert.dados?.periodo?.conclusao)}
        </p>
        <Button onClick={baixar} disabled={baixando} className="bg-slate-900">
          {baixando ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4 mr-2" />
          )}
          Baixar certificado (PDF)
        </Button>
        {erroPdf && (
          <p role="alert" className="text-sm text-red-700">
            {erroPdf}
          </p>
        )}
        {avisoPdf && (
          <p role="status" className="text-sm text-amber-800">
            {avisoPdf}
          </p>
        )}
        {avisoAssinaturas && (
          <p role="status" className="text-sm text-amber-800">
            {avisoAssinaturas}
          </p>
        )}
      </div>
    );
  }

  // curso de apoio ao presencial (T8): é material de estudo e nunca emite; não há o que regularizar
  if (cursoDeApoio(item.curso)) {
    return (
      <div
        role="status"
        className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
      >
        <p>{MSG_CURSO_DE_APOIO}</p>
      </div>
    );
  }

  if (!item.pode_emitir_certificado) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <p>Curso concluído. O certificado aguarda a regularização destes requisitos pelo RH:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          {(item.pendencias_certificado?.length
            ? item.pendencias_certificado
            : ["Aguarde a revisão do curso pelo RH"]
          ).map((texto) => (
            <li key={texto}>{texto}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form
      onSubmit={assinar}
      className="rounded-lg border border-emerald-200 bg-white p-4 space-y-3"
    >
      <p className="font-semibold flex items-center gap-2 text-slate-800">
        <PenLine className="w-5 h-5 text-emerald-600" /> Assine para emitir seu certificado
      </p>
      <p className="text-sm text-slate-700 bg-slate-50 rounded-md p-3">
        “Declaro que realizei pessoalmente este treinamento, assisti às aulas e fiz a avaliação.”
      </p>
      <div>
        <label htmlFor="senha-assinatura" className="text-sm text-slate-600">
          Digite sua senha para assinar
        </label>
        <Input
          id="senha-assinatura"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
          className="h-11 mt-1"
        />
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <Button
        type="submit"
        disabled={assinando || !senha}
        className="w-full h-11 bg-emerald-600 hover:bg-emerald-700"
      >
        {assinando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Assinar e emitir certificado
      </Button>
      <p className="text-[11px] text-slate-500">
        Ficam registrados data, hora, IP e aparelho — vale como assinatura eletrônica (Lei
        14.063/2020).
      </p>
    </form>
  );
}
