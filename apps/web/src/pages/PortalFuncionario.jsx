import React, { useEffect, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HardHat,
  Loader2,
  XCircle,
  CheckCircle2,
  PlayCircle,
  ChevronLeft,
  GraduationCap,
} from "lucide-react";

/**
 * Portal do Funcionário — treinamentos EAD (acesso por token no link, sem login).
 *
 * Regra central: a aula só conclui com >=90% de tempo ASSISTIDO acumulado
 * (contado enquanto o vídeo toca); o curso conclui quando todas as aulas
 * concluírem. Progresso é enviado periodicamente pra edge function
 * portal-funcionario, que valida o token e grava com service role.
 */

function tokenDaUrl() {
  const direto = new URLSearchParams(window.location.search).get("token");
  if (direto) return direto;
  const hash = window.location.hash || "";
  const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("token");
}

// Carrega a IFrame API do YouTube uma única vez
let ytApiPromise = null;
function carregarYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const anterior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        anterior?.();
        resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }
  return ytApiPromise;
}

function fmtData(d) {
  return d ? String(d).slice(0, 10).split("-").reverse().join("/") : "";
}

export default function PortalFuncionario() {
  const [token] = useState(tokenDaUrl);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState(null);
  const [cursoAberto, setCursoAberto] = useState(null); // item de dados.cursos
  const [aulaAtiva, setAulaAtiva] = useState(null);
  const playerRef = useRef(null);
  const assistidoRef = useRef(0); // segundos acumulados da aula ativa
  const timersRef = useRef({ tick: null, envio: null });

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const { data } = await sigo.functions.invoke("portalFuncionario", {
        acao: "dados",
        token,
      });
      if (data?.success === false) throw new Error(data.error);
      setDados(data);
    } catch (e) {
      setErro(e?.message || "Erro ao carregar seus treinamentos");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (token) carregar();
    else {
      setErro("Link inválido — peça um novo ao RH");
      setCarregando(false);
    }
  }, [token]);

  const enviarProgresso = async (matriculaId, aulaId, segundos, duracao) => {
    try {
      const { data } = await sigo.functions.invoke("portalFuncionario", {
        acao: "progresso",
        token,
        matricula_id: matriculaId,
        aula_id: aulaId,
        segundos_assistidos: Math.floor(segundos),
        duracao_seg: duracao ? Math.floor(duracao) : undefined,
      });
      if (data?.success === false) return null;
      return data;
    } catch {
      return null;
    }
  };

  const pararTimers = () => {
    clearInterval(timersRef.current.tick);
    clearInterval(timersRef.current.envio);
    timersRef.current = { tick: null, envio: null };
  };

  const abrirAula = async (aula) => {
    pararTimers();
    setAulaAtiva(aula);
    assistidoRef.current = aula.segundos_assistidos || 0;
    const YT = await carregarYouTubeAPI();
    playerRef.current?.destroy?.();
    playerRef.current = new YT.Player("player-aula", {
      videoId: aula.youtube_id,
      playerVars: { rel: 0, modestbranding: 1 },
      events: {
        onStateChange: (ev) => {
          if (ev.data === YT.PlayerState.PLAYING) {
            // conta tempo assistido enquanto toca; envia a cada 10s
            clearInterval(timersRef.current.tick);
            timersRef.current.tick = setInterval(() => {
              assistidoRef.current += 1;
            }, 1000);
            clearInterval(timersRef.current.envio);
            timersRef.current.envio = setInterval(() => {
              sincronizar(aula);
            }, 10000);
          } else {
            clearInterval(timersRef.current.tick);
            if (ev.data === YT.PlayerState.PAUSED || ev.data === YT.PlayerState.ENDED) {
              sincronizar(aula);
              clearInterval(timersRef.current.envio);
            }
          }
        },
      },
    });
  };

  const sincronizar = async (aula) => {
    const duracao = aula.duracao_seg || playerRef.current?.getDuration?.() || 0;
    const r = await enviarProgresso(
      cursoAberto.matricula.id,
      aula.id,
      assistidoRef.current,
      duracao
    );
    if (r?.aula_concluida && !aula.concluida) {
      aula.concluida = true;
      setDados((d) => ({ ...d })); // re-render
      if (r.curso_concluido) {
        pararTimers();
        await carregar();
        setCursoAberto(null);
        setAulaAtiva(null);
      }
    }
  };

  useEffect(() => () => pararTimers(), []);

  // ------------------------------------------------------------------ telas
  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando seus treinamentos...
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-10 text-center space-y-3">
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="font-medium text-slate-700">{erro}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // player de um curso aberto
  if (cursoAberto) {
    const aulas = cursoAberto.aulas || [];
    const feitas = aulas.filter((a) => a.concluida).length;
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-slate-900 text-white p-4 flex items-center gap-3">
          <button
            onClick={() => {
              pararTimers();
              playerRef.current?.destroy?.();
              setCursoAberto(null);
              setAulaAtiva(null);
              carregar();
            }}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <p className="font-semibold leading-tight">{cursoAberto.curso?.nome}</p>
            <p className="text-xs text-slate-300">
              {feitas}/{aulas.length} aulas concluídas
            </p>
          </div>
        </header>

        <div className="max-w-3xl mx-auto p-4 space-y-4">
          {aulaAtiva ? (
            <div className="space-y-2">
              <div className="aspect-video bg-black rounded-lg overflow-hidden">
                <div id="player-aula" className="w-full h-full" />
              </div>
              <p className="text-sm text-slate-600">
                <PlayCircle className="w-4 h-4 inline mr-1" />
                {aulaAtiva.titulo} — assista ao vídeo completo para concluir a aula
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-2">Escolha uma aula para assistir 👇</p>
          )}

          <div className="space-y-2">
            {aulas.map((a) => (
              <button
                key={a.id}
                onClick={() => abrirAula(a)}
                className={`w-full text-left rounded-lg border p-3 flex items-center gap-3 bg-white hover:border-slate-400 ${
                  aulaAtiva?.id === a.id ? "border-slate-800" : "border-slate-200"
                }`}
              >
                {a.concluida ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <PlayCircle className="w-5 h-5 text-slate-400 shrink-0" />
                )}
                <span className="flex-1 text-sm">
                  {a.ordem}. {a.titulo}
                </span>
                {a.concluida && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                    concluída
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // lista de cursos
  const cursos = dados?.cursos || [];
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white p-5">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
            <HardHat className="w-6 h-6" />
          </div>
          <div>
            <p className="font-semibold">{dados?.funcionario?.nome_completo}</p>
            <p className="text-xs text-slate-300">{dados?.empresa_nome} · Portal de Treinamentos</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-3">
        {cursos.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center text-slate-500">
              <GraduationCap className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              Nenhum treinamento atribuído a você no momento.
            </CardContent>
          </Card>
        )}
        {cursos.map((c) => {
          const total = c.aulas.length;
          const feitas = c.aulas.filter((a) => a.concluida).length;
          const m = c.matricula;
          return (
            <Card key={m.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{c.curso?.nome}</p>
                  <p className="text-xs text-slate-500">
                    {m.status === "concluido"
                      ? `Concluído em ${fmtData(m.data_conclusao)}` +
                        (m.proxima_renovacao
                          ? ` · próxima renovação ${fmtData(m.proxima_renovacao)}`
                          : "")
                      : `${feitas}/${total} aulas concluídas`}
                  </p>
                  <div className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        m.status === "concluido" ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${total ? Math.round((feitas / total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                {m.status === "concluido" ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
                ) : (
                  <Button onClick={() => setCursoAberto(c)} className="shrink-0 bg-slate-900">
                    {m.status === "pendente" ? "Começar" : "Continuar"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
