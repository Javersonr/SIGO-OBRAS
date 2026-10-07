import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { sigo } from "@/api/sigoClient";
import { acessoPortal, urlPortal } from "@/lib/portal-funcionario-acesso";
import {
  classificarEnvio,
  deveInterromperOLote,
  guardarAvisadosHoje,
  idsAvisadosHoje,
  prepararLoteDeAtrasados,
  resumirLote,
  rotuloDoMotivoPulado,
} from "@/lib/ead-aviso-matricula";
import { hojeEmBrasilia } from "@/lib/ead-vencimentos";

// espera entre uma mensagem e a seguinte: o número do WhatsApp é um só para todas as empresas
const PAUSA_ENTRE_ENVIOS_MS = 1500;
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Quem já recebeu o lembrete hoje fica no navegador (por empresa e por dia): uma segunda rodada não
// repete a mensagem. Sem storage (janela privada) o registro some, e a tela só perde essa proteção.
const chaveDosAvisados = (empresaId) => `sigo:ead:atrasados-avisados:${empresaId}`;
function lerAvisados(empresaId) {
  try {
    return idsAvisadosHoje(localStorage.getItem(chaveDosAvisados(empresaId)), hojeEmBrasilia());
  } catch {
    return [];
  }
}
function gravarAvisados(empresaId, ids) {
  try {
    const chave = chaveDosAvisados(empresaId);
    localStorage.setItem(
      chave,
      guardarAvisadosHoje(localStorage.getItem(chave), hojeEmBrasilia(), ids)
    );
  } catch {
    /* sem storage: segue sem o registro */
  }
}

/**
 * Aviso em lote aos funcionários com matrícula atrasada (T22). Uma mensagem por funcionário, só pelo canal
 * automático do WhatsApp e sem senha: quem não tem acesso ao portal (ou telefone válido) fica de fora e é
 * listado, com o motivo. O lote tem teto por clique (`LIMITE_DO_LOTE`, abaixo do teto por hora do canal),
 * pára se o canal recusar e termina com um resumo do que foi e do que falhou. As regras estão em
 * `lib/ead-aviso-matricula.js` (testadas); aqui só se desenha e se liga a rede.
 *
 * `linhas` = as linhas da tabela de matrículas (as `atrasada` entram). Fechada com `aberto` falso.
 */
export default function AvisoAtrasadosDialog({ aberto, linhas, empresaId, onFechar }) {
  const [carregando, setCarregando] = useState(false);
  const [acessos, setAcessos] = useState(null); // null = não deu para consultar
  const [erroAcessos, setErroAcessos] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(null); // { feitos, total }
  const [resultado, setResultado] = useState(null);
  const [avisadosHoje, setAvisadosHoje] = useState([]);
  const pararRef = useRef(false);
  const ocupadoRef = useRef(false);

  // a tela saiu do ar no meio do envio (outra aba, outra empresa): para, em vez de seguir mandando mensagens
  useEffect(
    () => () => {
      pararRef.current = true;
    },
    []
  );

  // cada abertura confere de novo quem tem acesso ao portal (pode ter mudado)
  useEffect(() => {
    if (!aberto) return undefined;
    let valido = true;
    setResultado(null);
    setProgresso(null);
    setErroAcessos("");
    setAcessos(null);
    setAvisadosHoje(lerAvisados(empresaId));
    setCarregando(true);
    acessoPortal
      .status(empresaId)
      .then((r) => {
        if (valido) setAcessos(r?.acessos ?? []);
      })
      .catch((e) => {
        if (valido) setErroAcessos(e?.message || "Não foi possível conferir o acesso ao portal");
      })
      .finally(() => {
        if (valido) setCarregando(false);
      });
    return () => {
      valido = false;
    };
  }, [aberto, empresaId]);

  // fechada, não monta lote nenhum (a tabela renderiza esta janela mesmo sem ninguém para avisar)
  const lote = useMemo(
    () =>
      aberto
        ? prepararLoteDeAtrasados({ linhas, acessos, urlPortal: urlPortal(), avisadosHoje })
        : { enviar: [], pulados: [], excedente: 0 },
    [aberto, linhas, acessos, avisadosHoje]
  );

  const enviar = async () => {
    if (ocupadoRef.current || lote.enviar.length === 0) return;
    ocupadoRef.current = true;
    pararRef.current = false;
    setEnviando(true);
    setResultado(null);
    const resultados = [];
    let interrompidoPor = null;
    let parou = false;
    try {
      for (let i = 0; i < lote.enviar.length; i += 1) {
        if (pararRef.current) {
          parou = true;
          break;
        }
        const alvo = lote.enviar[i];
        setProgresso({ feitos: i, total: lote.enviar.length });
        let classe;
        try {
          classe = classificarEnvio(
            await sigo.functions.invoke("enviarWhatsApp", {
              numero: alvo.numero,
              texto: alvo.texto,
            })
          );
        } catch (e) {
          console.error("[atrasados] envio falhou:", e);
          classe = "falhou";
        }
        resultados.push({ funcionarioId: alvo.funcionarioId, nome: alvo.nome, classe });
        if (deveInterromperOLote(classe)) {
          interrompidoPor = classe;
          break;
        }
        if (i < lote.enviar.length - 1) await esperar(PAUSA_ENTRE_ENVIOS_MS);
      }
      const feitos = resultados.filter((r) => r.classe === "enviado").map((r) => r.funcionarioId);
      if (feitos.length) {
        gravarAvisados(empresaId, feitos);
        // quem acabou de receber sai da lista na hora: uma nova rodada só pega o que sobrou ou falhou
        setAvisadosHoje((atuais) => [...new Set([...atuais, ...feitos])]);
      }
      const naoTentados = lote.enviar.length - resultados.length;
      const resumo = resumirLote({ resultados, naoTentados, interrompidoPor });
      setResultado({ ...resumo, parou });
      toast[resumo.tipo === "success" ? "success" : "warning"](resumo.texto, { duration: 10000 });
    } finally {
      setProgresso(null);
      setEnviando(false);
      ocupadoRef.current = false;
    }
  };

  const total = lote.enviar.length;
  return (
    <Dialog open={!!aberto} onOpenChange={(v) => !v && !enviando && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">Avisar os funcionários atrasados</DialogTitle>
          <DialogDescription>
            Cada funcionário recebe uma mensagem pelo WhatsApp com os cursos atrasados e o link do
            portal. A mensagem não leva senha: só vai a quem já tem acesso ao portal.
          </DialogDescription>
        </DialogHeader>

        {carregando && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o acesso ao portal...
          </p>
        )}
        {erroAcessos && (
          <p role="alert" className="text-sm text-red-600">
            {erroAcessos}. Sem isso o aviso em lote não pode ser enviado: tente de novo.
          </p>
        )}

        {!carregando && (
          <div className="space-y-4 text-sm">
            {total > 0 && (
              <div>
                <p className="font-medium text-slate-800">
                  {total} {total === 1 ? "funcionário vai receber" : "funcionários vão receber"} o
                  aviso
                </p>
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-slate-600">
                  {lote.enviar.map((e) => (
                    <li key={e.funcionarioId}>
                      <span className="font-medium">{e.nome}</span>:{" "}
                      {e.itens.map((i) => i.cursoNome).join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lote.excedente > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">
                O canal do WhatsApp permite poucas mensagens por hora. Esta rodada envia {total};
                restam {lote.excedente} para uma próxima rodada, daqui a pouco.
              </p>
            )}
            {lote.pulados.length > 0 && (
              <div>
                <p className="font-medium text-slate-800">
                  {lote.pulados.length} {lote.pulados.length === 1 ? "fica" : "ficam"} de fora
                </p>
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-slate-600">
                  {lote.pulados.map((p) => (
                    <li key={p.funcionarioId}>
                      <span className="font-medium">{p.nome}</span>:{" "}
                      {rotuloDoMotivoPulado(p.motivo)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {total === 0 && lote.pulados.length === 0 && !erroAcessos && (
              <p className="text-slate-500">Nenhum funcionário atrasado para avisar.</p>
            )}
          </div>
        )}

        {progresso && (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Enviando {progresso.feitos + 1} de{" "}
            {progresso.total}...
          </p>
        )}

        {resultado && (
          <div
            role="status"
            className={
              "rounded-md border p-3 text-sm " +
              (resultado.tipo === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800")
            }
          >
            <p>{resultado.texto}</p>
            {resultado.parou && <p className="mt-1">Você parou o envio antes do fim.</p>}
            {resultado.falhas.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {resultado.falhas.map((f) => (
                  <li key={f.funcionarioId}>{f.nome}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {enviando ? (
            <Button type="button" variant="outline" onClick={() => (pararRef.current = true)}>
              Parar depois deste
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={onFechar}>
              Fechar
            </Button>
          )}
          <Button type="button" disabled={enviando || carregando || total === 0} onClick={enviar}>
            {enviando ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="mr-1 h-4 w-4" />
            )}
            {total > 0 ? `Enviar ${total} ${total === 1 ? "aviso" : "avisos"}` : "Enviar avisos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
