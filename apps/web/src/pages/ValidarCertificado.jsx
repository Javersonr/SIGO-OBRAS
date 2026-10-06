import React, { useEffect, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import ResultadoValidacao from "@/components/portal-funcionario/ResultadoValidacao";
import { codigoCompleto, mascararCodigo, urlSemCodigo } from "@/lib/validacao-certificado";

/**
 * Página PÚBLICA de conferência de certificado EAD (fiscal do trabalho, RH de
 * contratante, o próprio funcionário). Aceita ?codigo= vindo do QR code.
 */
export default function ValidarCertificado() {
  const [codigo, setCodigo] = useState(() =>
    mascararCodigo(new URLSearchParams(window.location.search).get("codigo") || "")
  );
  const [resultado, setResultado] = useState(null);
  const [consultadoEm, setConsultadoEm] = useState(null);
  const [erro, setErro] = useState("");
  const [buscando, setBuscando] = useState(false);
  const campoRef = useRef(null);

  const consultar = async (c = codigo) => {
    if (buscando) return;
    setErro("");
    setResultado(null);
    if (!codigoCompleto(c)) {
      setErro("Código inválido — são 12 letras e números");
      return;
    }
    setBuscando(true);
    try {
      const { data } = await sigo.functions.invoke("validarCertificado", { codigo: c });
      if (data?.success === false) throw new Error(data.error);
      setResultado(data);
      setConsultadoEm(new Date().toISOString());
    } catch (e) {
      setErro(e.message || "Não foi possível consultar agora");
    } finally {
      setBuscando(false);
    }
  };

  useEffect(() => {
    if (codigo) consultar(codigo);
  }, []);

  // volta ao começo: limpa o campo e o resultado e tira o ?codigo= da barra, para recarregar a página
  // não consultar de novo o código que o QR trouxe
  const consultarOutro = () => {
    setCodigo("");
    setResultado(null);
    setConsultadoEm(null);
    setErro("");
    try {
      window.history.replaceState(null, "", urlSemCodigo(window.location.href));
    } catch {
      /* sem histórico (navegador restrito): a página continua funcionando */
    }
    campoRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-12 print:bg-white print:pt-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center space-y-1">
          <img src="/favicon.svg" alt="SIGO Obras" className="w-14 h-14 mx-auto rounded-xl" />
          <h1 className="text-xl font-semibold text-slate-900">Validar certificado</h1>
          <p className="text-sm text-slate-500 print:hidden">
            Digite o código de autenticidade impresso no certificado.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            consultar();
          }}
          className="flex gap-2 print:hidden"
        >
          <Input
            ref={campoRef}
            value={codigo}
            onChange={(e) => setCodigo(mascararCodigo(e.target.value))}
            placeholder="XXXX-XXXX-XXXX"
            aria-label="Código de autenticidade"
            className="h-11 font-mono tracking-wider"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button
            type="submit"
            aria-label="Consultar"
            className="h-11 bg-slate-900"
            disabled={buscando || !codigoCompleto(codigo)}
          >
            {buscando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </form>

        {erro && (
          <p role="alert" className="text-sm text-red-600 text-center">
            {erro}
          </p>
        )}

        <ResultadoValidacao
          resultado={resultado}
          consultadoEm={consultadoEm}
          onImprimir={() => window.print()}
          onConsultarOutro={consultarOutro}
        />
      </div>
    </div>
  );
}
