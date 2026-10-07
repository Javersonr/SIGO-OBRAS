import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Printer,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ShieldX,
} from "lucide-react";
import { apresentacaoDoResultado, avisoDeIntegridade, dataBr } from "@/lib/validacao-certificado";
import { dataHoraBrasilia } from "@/lib/data-brasilia";
import { tipoPublicoDoCertificado } from "@/lib/ead-tipo-matricula";
import { fmtDataHora } from "./api";

/**
 * Resultado da conferência PÚBLICA de um certificado EAD (página /ValidarCertificado, T10 e T36): o
 * cartão com o estado e os dados, a data da consulta e os botões "Imprimir" e "Consultar outro código"
 * (a faixa dos botões não sai na impressão). A decisão do estado é do servidor; a cor e o texto vêm de
 * lib/validacao-certificado.js. `consultadoEm` = quando a resposta chegou (ISO), só para constar no papel.
 */

const fmtCnpj = (c) => {
  const d = (c || "").replace(/\D/g, "");
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : c || "";
};

// cor e ícone de cada estado da validação
const ESTILO = {
  verde: { Icone: ShieldCheck, card: "border-emerald-300", texto: "text-emerald-700" },
  ambar: { Icone: ShieldAlert, card: "border-amber-300", texto: "text-amber-700" },
  vermelho: { Icone: ShieldX, card: "border-red-300", texto: "text-red-700" },
  // resposta que a página não sabe interpretar: nunca verde (T10, M3)
  cinza: { Icone: ShieldQuestion, card: "border-slate-300", texto: "text-slate-700" },
};

export default function ResultadoValidacao({
  resultado,
  consultadoEm = null,
  onImprimir,
  onConsultarOutro,
}) {
  if (!resultado) return null;
  const c = resultado.certificado;
  const apresentacao = c ? apresentacaoDoResultado(resultado, { validade: c.validade }) : null;
  const estilo = apresentacao ? ESTILO[apresentacao.tom] : null;
  const aviso = c ? avisoDeIntegridade(resultado) : null;
  // tipo do treinamento (T23): inicial, periódico ou eventual (com o motivo); certificado antigo não o traz
  const tipo = c
    ? tipoPublicoDoCertificado({
        tipo_treinamento: c.tipo_treinamento,
        motivo_eventual: c.motivo_eventual,
      })
    : null;
  // código sem certificado (não existe): nada a imprimir, só consultar outro
  const imprimivel = !!(c && apresentacao);

  return (
    <>
      {!resultado.encontrado && (
        <Card className="border-red-200">
          <CardContent className="p-5 flex items-center gap-3 text-red-700">
            <ShieldX className="w-8 h-8 shrink-0" />
            <p>Nenhum certificado com esse código. Confira se digitou corretamente.</p>
          </CardContent>
        </Card>
      )}

      {imprimivel && (
        <Card className={`${estilo.card} print:shadow-none`}>
          <CardContent className="p-5 space-y-3">
            <div className={`flex items-center gap-2 font-semibold ${estilo.texto}`}>
              <estilo.Icone className="w-6 h-6" />
              {apresentacao.titulo}
            </div>
            {apresentacao.detalhe && (
              <p className={`text-sm ${estilo.texto}`}>{apresentacao.detalhe}</p>
            )}
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
              {tipo && (
                <>
                  <dt className="text-slate-500">Tipo de treinamento</dt>
                  <dd>{tipo.rotulo}</dd>
                  {tipo.motivo && (
                    <>
                      <dt className="text-slate-500">Motivo</dt>
                      <dd>{tipo.motivo}</dd>
                    </>
                  )}
                </>
              )}
              {c.local?.ambiente && (
                <>
                  <dt className="text-slate-500">Local</dt>
                  <dd>{c.local.ambiente}</dd>
                </>
              )}
              {/* semipresencial (T12): o dia (ou o primeiro e o último), o local e a carga da prática presencial */}
              {c.pratica?.data && (
                <>
                  <dt className="text-slate-500">Prática presencial</dt>
                  <dd>
                    {dataBr(c.pratica.data)}
                    {c.pratica.data_fim ? ` a ${dataBr(c.pratica.data_fim)}` : ""}
                    {c.pratica.local ? `, em ${c.pratica.local}` : ""}
                    {c.pratica.carga_horas
                      ? ` (${String(c.pratica.carga_horas).replace(".", ",")} h)`
                      : ""}
                  </dd>
                </>
              )}
              <dt className="text-slate-500">Período</dt>
              <dd>
                {dataBr(c.inicio)} a {dataBr(c.conclusao)}
              </dd>
              {c.validade && (
                <>
                  <dt className="text-slate-500">Validade</dt>
                  <dd>até {dataBr(c.validade)}</dd>
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
              <dd>{c.assinado_pelo_aluno_em ? dataHoraBrasilia(c.assinado_pelo_aluno_em) : "—"}</dd>
              <dt className="text-slate-500">Código</dt>
              <dd className="font-mono">{c.codigo}</dd>
            </dl>
            {aviso && <p className="text-xs text-slate-500">{aviso}</p>}
            <p className="text-[10px] text-slate-400 break-all">SHA-256: {c.hash_sha256}</p>
          </CardContent>
        </Card>
      )}

      {imprimivel && consultadoEm && (
        <p className="text-xs text-slate-500 text-center">
          {`Consulta feita em ${fmtDataHora(consultadoEm)}`}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row print:hidden">
        {imprimivel && (
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={onImprimir}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir
          </Button>
        )}
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onConsultarOutro}>
          <RotateCcw className="w-4 h-4 mr-2" /> Consultar outro código
        </Button>
      </div>
    </>
  );
}
