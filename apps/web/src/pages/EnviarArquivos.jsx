import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { aplicarSessao, sigo, supabase } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  Building2,
  Check,
  FileSpreadsheet,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";
import { erroDeSessao, sessaoCustomConfere } from "@/lib/conector";
import { extrairPaginasPdf } from "@/lib/edital-ia";
import { safeParseJSON } from "@/lib/json-utils";
import {
  arquivoCabeNoSlot,
  CATEGORIAS_COM_TEXTO,
  gravarTextoPaginas,
  LIMITE_ANEXO_ATESTADO,
  LIMITE_ANEXO_OPORTUNIDADE,
  lerParametroLink,
  precisaTrocarEmpresa,
} from "@/lib/envio-arquivos";

/**
 * Página de envio de arquivos do conector do Claude (/EnviarArquivos?link=<id>), spec 2026-09-25
 * §4.6. Pública no Layout: confere sozinha a sessão (a do Supabase E o custom_auth desta aba, do
 * mesmo usuário, como a /AutorizarConector); sem isso, vai ao login com ?voltar=.
 *
 * O Claude gerou o link (gerar_link_envio) com os arquivos esperados. Cada vaga sobe direto para o
 * Storage por URL assinada (o token vem do mcp-oauth na hora); "Concluir" registra os arquivos na
 * oportunidade ou no atestado (mesma rotina do Claude Code). Depois, o texto dos PDFs do edital é
 * extraído aqui no navegador e gravado para o Claude ler (ler_edital_anexado) — isso passa pela
 * RLS, então exige a sessão na empresa do link (a página oferece a troca).
 */

const MIME = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function irParaLogin() {
  const voltar = window.location.pathname + window.location.search;
  window.location.replace(`/EntrarSistema?voltar=${encodeURIComponent(voltar)}`);
}

function lerCustomAuth() {
  try {
    return sessionStorage.getItem("custom_auth");
  } catch {
    return null;
  }
}

const dataHora = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

export default function EnviarArquivos() {
  const linkId = useMemo(() => lerParametroLink(window.location.search), []);
  const [estado, setEstado] = useState("carregando"); // carregando | pronto | erro
  const [erro, setErro] = useState("");
  const [erroSessao, setErroSessao] = useState(false);
  const [dados, setDados] = useState(null);
  const [empresaSessao, setEmpresaSessao] = useState(null);
  const [locais, setLocais] = useState({}); // indice → File enviado por esta página
  const [vagas, setVagas] = useState({}); // indice → { status: "enviando" | "enviado" | "erro", msg? }
  const [concluindo, setConcluindo] = useState(false);
  const [faltam, setFaltam] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [texto, setTexto] = useState(null); // { status: "gravando" | "ok" | "troca" | "erro", msg }
  const [trocando, setTrocando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!linkId) {
        setErro("Link de envio inválido. Peça um link novo ao Claude.");
        setEstado("erro");
        return;
      }
      const sessao = supabase ? (await supabase.auth.getSession()).data?.session : null;
      if (!sessao || !sessaoCustomConfere(lerCustomAuth(), sessao.user?.email)) {
        irParaLogin();
        return;
      }
      setEmpresaSessao(sessao.user?.app_metadata?.empresa_id ?? null);
      const { data } = await sigo.functions.invoke("mcpOauth", {
        acao: "link_envio",
        link_id: linkId,
      });
      if (cancelado) return;
      if (data?.success === false || !data?.link_id) {
        setErro(data?.error || "Não foi possível abrir o link de envio.");
        setErroSessao(erroDeSessao(data));
        setEstado("erro");
        return;
      }
      setDados(data);
      setEstado("pronto");
    })();
    return () => {
      cancelado = true;
    };
  }, [linkId]);

  // Só a oportunidade grava texto (RLS): o atestado envia o PDF sem depender da empresa da sessão
  const trocar =
    !!dados &&
    dados.alvo === "oportunidade" &&
    precisaTrocarEmpresa(empresaSessao, dados.empresa?.id);
  const limite = dados?.alvo === "atestado" ? LIMITE_ANEXO_ATESTADO : LIMITE_ANEXO_OPORTUNIDADE;

  const enviar = async (slot, file) => {
    const cabe = arquivoCabeNoSlot(file, slot, limite);
    if (!cabe.ok) {
      toast.error(cabe.erro);
      return;
    }
    setVagas((v) => ({ ...v, [slot.indice]: { status: "enviando" } }));
    let erroEnvio = null;
    try {
      const { error } = await supabase.storage
        .from(slot.upload.bucket)
        .uploadToSignedUrl(slot.upload.path, slot.upload.token, file, {
          contentType: MIME[slot.tipo],
        });
      erroEnvio = error;
    } catch (e) {
      erroEnvio = e; // queda de rede: sem isto a vaga ficava "enviando" para sempre
    }
    if (erroEnvio) {
      const msg = erroEnvio.message || "falha no envio";
      setVagas((v) => ({ ...v, [slot.indice]: { status: "erro", msg } }));
      toast.error(`Não foi possível enviar "${file.name}": ${msg}`);
      return;
    }
    setLocais((l) => ({ ...l, [slot.indice]: file }));
    setVagas((v) => ({ ...v, [slot.indice]: { status: "enviado" } }));
  };

  // Depois de "faltam arquivos" o servidor pode ter apagado um objeto de tipo errado: a vaga volta a
  // pedir o arquivo (com token novo). Recarrega as vagas em vez de confiar no estado local.
  const recarregarVagas = async () => {
    const { data } = await sigo.functions.invoke("mcpOauth", {
      acao: "link_envio",
      link_id: linkId,
    });
    if (data?.link_id) {
      setDados(data);
      setVagas({});
    }
  };

  const gravarTextos = async (res) => {
    if (dados.alvo !== "oportunidade") return;
    const doEdital = (res.registrados || []).filter((r) => {
      const slot = dados.arquivos.find((a) => a.indice === r.indice);
      return r.arquivo_id && slot?.tipo === "pdf" && CATEGORIAS_COM_TEXTO.includes(slot.categoria);
    });
    if (!doEdital.length) return;
    if (trocar) {
      setTexto({ status: "troca" });
      return;
    }
    setTexto({ status: "gravando", msg: "Preparando o texto dos PDFs para o Claude…" });
    try {
      let paginas = 0;
      let semArquivo = 0;
      for (const r of doEdital) {
        const file = locais[r.indice];
        if (!file) {
          semArquivo += 1; // enviado por fora desta página: fica para o "Preparar para o Claude"
          continue;
        }
        const lido = await extrairPaginasPdf(file, null, {
          renderizar: false,
          maxEscaneadas: Infinity,
        });
        paginas += await gravarTextoPaginas(sigo.entities.ArquivoTextoPagina, {
          empresaId: dados.empresa.id,
          arquivoId: r.arquivo_id,
          paginas: lido.paginas,
        });
      }
      const partes = [];
      if (paginas) partes.push(`Texto de ${paginas} página(s) pronto para o Claude.`);
      if (semArquivo) {
        partes.push(
          `${semArquivo} PDF(s) enviado(s) por fora desta página: use "Preparar para o Claude" na aba Arquivos.`
        );
      }
      setTexto({ status: "ok", msg: partes.join(" ") });
    } catch (e) {
      setTexto({
        status: "erro",
        msg: `Os arquivos foram anexados, mas o texto para o Claude não foi gravado (${e?.message || "erro"}). Use "Preparar para o Claude" na aba Arquivos.`,
      });
    }
  };

  const concluir = async (aceitarParcial = false) => {
    setConcluindo(true);
    try {
      const { data } = await sigo.functions.invoke("mcpOauth", {
        acao: "concluir_envio",
        link_id: linkId,
        aceitar_parcial: aceitarParcial,
      });
      if (data?.success === false) {
        if (erroDeSessao(data)) {
          irParaLogin();
          return;
        }
        if (data.codigo === "faltam_arquivos") {
          setFaltam(data.recusados || []);
          await recarregarVagas();
          return;
        }
        toast.error(data.error || "Não foi possível concluir o envio.");
        return;
      }
      setFaltam(null);
      setResultado(data);
      await gravarTextos(data);
    } finally {
      setConcluindo(false);
    }
  };

  const trocarEmpresa = async () => {
    setTrocando(true);
    try {
      const { data } = await sigo.functions.invoke("trocarEmpresa", {
        empresa_id: dados.empresa.id,
      });
      if (data?.success === false) {
        toast.error(data.error || "Não foi possível trocar de empresa.");
        return;
      }
      if (data?.session) await aplicarSessao(data.session);
      else if (data?.needs_refresh) await supabase.auth.refreshSession();
      if (data?.usuario) {
        const atual = safeParseJSON(lerCustomAuth(), {});
        sessionStorage.setItem(
          "custom_auth",
          JSON.stringify({
            ...atual,
            empresa_id: data.usuario.empresa_id,
            perfil: data.usuario.perfil,
          })
        );
        sessionStorage.setItem("empresa_ativa", data.usuario.empresa_id);
      }
      window.location.reload();
    } finally {
      setTrocando(false);
    }
  };

  const pendente = dados?.situacao === "pendente" && !resultado;

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-amber-500" /> Enviar arquivos ao SIGO Obras
          </CardTitle>
          {dados && (
            <CardDescription>
              {dados.alvo === "oportunidade" ? "Oportunidade" : "Atestado"}{" "}
              <strong>{dados.alvo_nome || "—"}</strong> · empresa{" "}
              <strong>{dados.empresa?.nome}</strong>
              {dados.situacao === "pendente" && <> · vale até {dataHora(dados.expira_em)}</>}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {estado === "carregando" && (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          )}

          {estado === "erro" && (
            <div className="space-y-3">
              <p className="flex gap-2 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {erro}
              </p>
              {erroSessao && (
                <Button variant="outline" onClick={irParaLogin}>
                  Entrar no SIGO de novo
                </Button>
              )}
            </div>
          )}

          {dados && trocar && !resultado && (
            <div className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded p-3 space-y-2">
              <p className="flex gap-2">
                <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                Este link é da empresa <strong>{dados.empresa?.nome}</strong>, e o SIGO está aberto
                em outra empresa. Troque para ela antes de enviar, para o SIGO gravar o texto dos
                PDFs para o Claude.
              </p>
              <Button size="sm" variant="outline" disabled={trocando} onClick={trocarEmpresa}>
                {trocando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Trocar para {dados.empresa?.nome}
              </Button>
            </div>
          )}

          {dados && dados.situacao !== "pendente" && !resultado && (
            <p className="text-sm text-slate-600">
              {dados.situacao === "usado"
                ? "Este link já foi usado. Os arquivos já estão no SIGO."
                : "Este link expirou (vale 2 horas). Peça um link novo ao Claude."}
            </p>
          )}

          {dados && (
            <ul className="space-y-2">
              {dados.arquivos.map((slot) => {
                const vaga = vagas[slot.indice];
                const enviado = slot.enviado || vaga?.status === "enviado";
                const Icone = slot.tipo === "xlsx" ? FileSpreadsheet : FileText;
                return (
                  <li
                    key={slot.indice}
                    className="flex items-center justify-between gap-3 p-3 bg-white border rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icone className="w-5 h-5 shrink-0 text-slate-500" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 break-all">{slot.nome}</p>
                        <p className="text-xs text-slate-500">
                          {slot.pasta ||
                            slot.categoria ||
                            (slot.tipo === "xlsx" ? "Planilha" : "PDF")}
                          {vaga?.status === "erro" && (
                            <span className="text-red-600"> · {vaga.msg}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {enviado ? (
                      <span className="flex items-center gap-1 text-sm text-emerald-700">
                        <Check className="w-4 h-4" /> Enviado
                      </span>
                    ) : vaga?.status === "enviando" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                    ) : pendente && slot.upload ? (
                      <label className="cursor-pointer text-sm font-medium text-amber-700 hover:underline">
                        Escolher arquivo
                        <input
                          type="file"
                          className="hidden"
                          accept={slot.tipo === "xlsx" ? ".xlsx" : ".pdf"}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) enviar(slot, f);
                          }}
                        />
                      </label>
                    ) : (
                      <span className="text-sm text-slate-400">Não enviado</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {faltam && (
            <div className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded p-3 space-y-2">
              <p>Ainda faltam arquivos:</p>
              <ul className="list-disc pl-5">
                {faltam.map((r) => (
                  <li key={r.indice}>
                    {r.nome}: {r.problema || r.motivo}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                disabled={concluindo}
                onClick={() => concluir(true)}
              >
                Concluir só com os enviados
              </Button>
            </div>
          )}

          {pendente && (
            <div className="flex justify-end">
              <Button
                className="bg-amber-500 hover:bg-amber-600"
                disabled={concluindo}
                onClick={() => concluir(false)}
              >
                {concluindo && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Concluir
              </Button>
            </div>
          )}

          {resultado && (
            <div className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded p-3 space-y-1">
              <p className="flex gap-2 font-medium">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                {resultado.registrados.length} arquivo(s) anexado(s). Volte ao Claude e diga que
                terminou.
              </p>
              {texto?.status === "gravando" && (
                <p className="flex items-center gap-2 text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> {texto.msg}
                </p>
              )}
              {(texto?.status === "ok" || texto?.status === "erro") && (
                <p className={texto.status === "erro" ? "text-amber-800" : "text-slate-600"}>
                  {texto.msg}
                </p>
              )}
              {texto?.status === "troca" && (
                <p className="text-amber-800">
                  O texto dos PDFs não foi gravado porque o SIGO está aberto em outra empresa.
                  Troque para {dados.empresa?.nome} e use &quot;Preparar para o Claude&quot; na aba
                  Arquivos.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
