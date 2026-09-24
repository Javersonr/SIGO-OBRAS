import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, ShieldX, Loader2, Search } from "lucide-react";

const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const fmtCnpj = (c) => {
  const d = (c || "").replace(/\D/g, "");
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : c || "";
};

/**
 * Página PÚBLICA de conferência de certificado EAD (fiscal do trabalho, RH de
 * contratante, o próprio funcionário). Aceita ?codigo= vindo do QR code.
 */
export default function ValidarCertificado() {
  const [codigo, setCodigo] = useState(
    () => new URLSearchParams(window.location.search).get("codigo") || ""
  );
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [buscando, setBuscando] = useState(false);

  const consultar = async (c = codigo) => {
    setErro("");
    setResultado(null);
    setBuscando(true);
    try {
      const { data } = await sigo.functions.invoke("validarCertificado", { codigo: c });
      if (data?.success === false) throw new Error(data.error);
      setResultado(data);
    } catch (e) {
      setErro(e.message || "Não foi possível consultar agora");
    } finally {
      setBuscando(false);
    }
  };

  useEffect(() => {
    if (codigo) consultar(codigo);
  }, []);

  const c = resultado?.certificado;

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-12">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center space-y-1">
          <ShieldCheck className="w-10 h-10 mx-auto text-slate-700" />
          <h1 className="text-xl font-semibold text-slate-900">Validar certificado</h1>
          <p className="text-sm text-slate-500">
            Digite o código de autenticidade impresso no certificado.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            consultar();
          }}
          className="flex gap-2"
        >
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            className="h-11 font-mono tracking-wider"
            autoCapitalize="characters"
          />
          <Button type="submit" className="h-11 bg-slate-900" disabled={buscando || !codigo.trim()}>
            {buscando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </form>

        {erro && <p className="text-sm text-red-600 text-center">{erro}</p>}

        {resultado && !resultado.encontrado && (
          <Card className="border-red-200">
            <CardContent className="p-5 flex items-center gap-3 text-red-700">
              <ShieldX className="w-8 h-8 shrink-0" />
              <p>Nenhum certificado com esse código. Confira se digitou corretamente.</p>
            </CardContent>
          </Card>
        )}

        {c && (
          <Card className={resultado.valido ? "border-emerald-300" : "border-red-300"}>
            <CardContent className="p-5 space-y-3">
              <div
                className={`flex items-center gap-2 font-semibold ${
                  resultado.valido ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {resultado.valido ? (
                  <ShieldCheck className="w-6 h-6" />
                ) : (
                  <ShieldX className="w-6 h-6" />
                )}
                {resultado.valido ? "Certificado autêntico" : "Certificado REVOGADO"}
              </div>
              {resultado.revogado && resultado.motivo_revogacao && (
                <p className="text-sm text-red-700">Motivo: {resultado.motivo_revogacao}</p>
              )}
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-slate-500">Participante</dt>
                <dd className="font-medium text-slate-900">{c.aluno}</dd>
                <dt className="text-slate-500">CPF</dt>
                <dd>{c.cpf || "—"}</dd>
                <dt className="text-slate-500">Curso</dt>
                <dd>{c.curso}</dd>
                <dt className="text-slate-500">Carga horária</dt>
                <dd>
                  {c.carga_horaria_horas} h · {c.modalidade}
                </dd>
                <dt className="text-slate-500">Período</dt>
                <dd>
                  {fmtData(c.inicio)} a {fmtData(c.conclusao)}
                </dd>
                {c.validade && (
                  <>
                    <dt className="text-slate-500">Validade</dt>
                    <dd>até {fmtData(c.validade)}</dd>
                  </>
                )}
                <dt className="text-slate-500">Empresa</dt>
                <dd>
                  {c.empresa}
                  {c.cnpj ? ` · CNPJ ${fmtCnpj(c.cnpj)}` : ""}
                </dd>
                {c.responsavel_tecnico?.nome && (
                  <>
                    <dt className="text-slate-500">Resp. técnico</dt>
                    <dd>
                      {c.responsavel_tecnico.nome}
                      {c.responsavel_tecnico.registro ? ` · ${c.responsavel_tecnico.registro}` : ""}
                    </dd>
                  </>
                )}
                <dt className="text-slate-500">Assinado pelo participante</dt>
                <dd>
                  {c.assinado_pelo_aluno_em
                    ? new Date(c.assinado_pelo_aluno_em).toLocaleString("pt-BR")
                    : "—"}
                </dd>
                <dt className="text-slate-500">Código</dt>
                <dd className="font-mono">{c.codigo}</dd>
              </dl>
              <p className="text-[10px] text-slate-400 break-all">SHA-256: {c.hash_sha256}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
