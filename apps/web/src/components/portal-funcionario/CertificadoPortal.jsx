import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Award, Loader2, FileDown, PenLine } from "lucide-react";
import { chamarPortal, fmtData } from "./api";
import { baixarCertificadoPdf } from "@/lib/certificado-ead";

/**
 * Certificado do curso concluído. Emitir = ASSINAR: o funcionário confirma a
 * declaração digitando a própria senha, e o servidor registra quando e de onde.
 */
export default function CertificadoPortal({ item, token, evento, recarregar, tratarErro }) {
  const cert = item.certificado;
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [assinando, setAssinando] = useState(false);
  const [baixando, setBaixando] = useState(false);

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
    setBaixando(true);
    try {
      evento("abrir_certificado");
      await baixarCertificadoPdf(cert);
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
      </div>
    );
  }

  if (!item.pode_emitir_certificado) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        🎉 Curso concluído. O certificado fica disponível assim que o RH definir a carga horária do
        curso.
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
