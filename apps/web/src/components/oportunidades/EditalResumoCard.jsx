import React from "react";
import { AlertTriangle, ExternalLink, FileText, Sparkles } from "lucide-react";
import { safeParseJSON } from "@/lib/json-utils";
import { safeUrl } from "@/lib/safe-url";
import { formatBRL } from "@/lib/formatters";
import AtendeEdital from "./edital/AtendeEdital";

/**
 * Card "Edital (IA)" da aba Geral: o que a IA leu do edital (oportunidade.
 * edital_analise.extraido, com a página de cada prazo) + a conferência com o
 * acervo (<AtendeEdital>). Os campos da licitação gravados na oportunidade
 * (que o usuário pode ter corrigido) ficam na seção "Dados da Licitação".
 */

// "AAAA-MM-DD" → "DD/MM/AAAA" sem new Date() (fuso BR voltaria 1 dia)
const dataBR = (iso) => {
  const [a, m, d] = String(iso || "")
    .slice(0, 10)
    .split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};
const dataHora = (p) => (p?.data ? dataBR(p.data) + (p.hora ? ` às ${p.hora}` : "") : "");

const FORMAS = { eletronica: "Eletrônica", presencial: "Presencial" };
const MODALIDADES = {
  concorrencia: "Concorrência",
  tomada_precos: "Tomada de Preços",
  convite: "Convite",
  pregao: "Pregão",
  dispensa: "Dispensa",
  inexigibilidade: "Inexigibilidade",
  outra: "Outra",
};
const CATEGORIAS = {
  edital: "Edital",
  termo_referencia: "TR",
  anexo_edital: "Anexo",
  errata: "Errata",
};

const simNao = (v) => (v === true ? "Sim" : v === false ? "Não" : null);

function textoGarantia(g) {
  if (!g || g.exigida == null) return null;
  if (!g.exigida) return "Não exigida";
  const partes = ["Exigida"];
  if (g.percentual != null) partes.push(`${String(g.percentual).replace(".", ",")}%`);
  if (g.valor != null) partes.push(formatBRL(g.valor));
  return partes.join(" — ");
}

function textoVisita(vt) {
  if (!vt) return null;
  const partes = [];
  if (vt.obrigatoria === true) partes.push("Obrigatória");
  else if (vt.obrigatoria === false) partes.push("Facultativa");
  const quando = dataHora(vt);
  if (quando) partes.push(quando);
  if (vt.descricao) partes.push(vt.descricao);
  return partes.length ? partes.join(" — ") : null;
}

const dataHoraIso = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "";
};

function Pagina({ n }) {
  if (!n) return null;
  return <span className="ml-1 text-xs font-normal text-slate-400">p. {n}</span>;
}

function Item({ rotulo, children, pagina, largo = false }) {
  return (
    <div className={largo ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">
        {children}
        <Pagina n={pagina} />
      </dd>
    </div>
  );
}

export default function EditalResumoCard({ analise, onReanalisar }) {
  const dados = safeParseJSON(analise, null);
  if (!dados || typeof dados !== "object") return null;
  const ex = safeParseJSON(dados.extraido, null) || {};
  const datas = ex.datas || {};

  const prazos = [
    ["Sessão", datas.sessao],
    ["Proposta até", datas.proposta_limite],
    ["Impugnação até", datas.impugnacao_limite],
    ["Esclarecimento até", datas.esclarecimento_limite],
  ].filter(([, p]) => p?.data);

  const portal = typeof ex.portal === "string" ? ex.portal.trim() : "";
  const portalEhLink = /^https?:\/\//i.test(portal);
  const garantia = textoGarantia(ex.garantia_proposta);
  const visita = textoVisita(datas.visita_tecnica);
  const meEpp = simNao(ex.exclusiva_me_epp);
  const arquivos = Array.isArray(dados.arquivos) ? dados.arquivos : [];
  const avisos = Array.isArray(ex.avisos) ? ex.avisos.filter(Boolean) : [];
  const lidoEm = dataHoraIso(dados.analisado_em);

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-2 font-medium text-slate-700">
          <Sparkles className="h-4 w-4 text-amber-600" />
          Edital (IA)
        </h4>
        {(lidoEm || dados.analisado_por) && (
          <span className="text-xs text-slate-400">
            Lido{lidoEm ? ` em ${lidoEm}` : ""}
            {dados.analisado_por ? ` por ${dados.analisado_por}` : ""}
          </span>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          {(ex.numero_edital || ex.modalidade) && (
            <Item rotulo="Edital">
              {[
                MODALIDADES[ex.modalidade] || ex.modalidade,
                ex.numero_edital && `nº ${ex.numero_edital}`,
              ]
                .filter(Boolean)
                .join(" ")}
            </Item>
          )}
          {ex.numero_processo && <Item rotulo="Processo">{ex.numero_processo}</Item>}
          {ex.orgao && <Item rotulo="Órgão">{ex.orgao}</Item>}
          {(portal || ex.forma) && (
            <Item rotulo="Disputa">
              {FORMAS[ex.forma] || ex.forma || ""}
              {portal && (ex.forma ? " — " : "")}
              {portalEhLink ? (
                <a
                  href={safeUrl(portal)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-amber-700 underline"
                >
                  {portal.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                portal
              )}
            </Item>
          )}
          {prazos.map(([rotulo, p]) => (
            <Item key={rotulo} rotulo={rotulo} pagina={p.pagina}>
              {dataHora(p)}
            </Item>
          ))}
          {visita && (
            <Item rotulo="Visita técnica" pagina={datas.visita_tecnica?.pagina} largo>
              {visita}
            </Item>
          )}
          {garantia && (
            <Item rotulo="Garantia de proposta" pagina={ex.garantia_proposta?.pagina}>
              {garantia}
            </Item>
          )}
          {meEpp && <Item rotulo="Exclusiva ME/EPP">{meEpp}</Item>}
          {simNao(ex.consorcio_permitido) && (
            <Item rotulo="Consórcio">{simNao(ex.consorcio_permitido)}</Item>
          )}
          {simNao(ex.subcontratacao_permitida) && (
            <Item rotulo="Subcontratação">{simNao(ex.subcontratacao_permitida)}</Item>
          )}
        </dl>

        {arquivos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {arquivos.map((a, i) => (
              <span
                key={a.arquivo_oportunidade_id || i}
                className="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600"
                title={a.nome || ""}
              >
                <FileText className="h-3 w-3 flex-shrink-0" />
                {CATEGORIAS[a.categoria] && (
                  <span className="font-medium text-slate-700">{CATEGORIAS[a.categoria]}:</span>
                )}
                <span className="truncate">{a.nome || "arquivo"}</span>
              </span>
            ))}
          </div>
        )}

        {avisos.length > 0 && (
          <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
            {avisos.map((a, i) => (
              <li key={i} className="flex gap-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                <span>{String(a)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AtendeEdital analise={dados} onReanalisar={onReanalisar} />
    </div>
  );
}
