import React, { useEffect, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Loader2, QrCode, RefreshCw, LogOut } from "lucide-react";
import { toast } from "sonner";

const INTERVALO_MS = 3000;
const TICKS_POR_QR = 5; // QR novo a cada ~15s
const TICKS_MAX = 40; // desiste após ~2 min sem leitura

function formatarNumero(digitos) {
  if (!digitos) return "";
  const d = digitos.startsWith("55") ? digitos.slice(2) : digitos;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const meio = resto.length - 4;
  return `+55 (${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`;
}

async function chamar(acao) {
  const { data } = await sigo.functions.invoke("saasConfig", { acao });
  if (data?.success === false) throw new Error(data.error || "Falha na integração");
  return data.whatsapp;
}

/**
 * Conexão do WhatsApp usado nos envios automáticos (link do portal de
 * treinamentos, ciência de EPI, código de recuperação de senha).
 * O QR vem do servidor (Evolution) e se renova sozinho enquanto espera.
 */
export default function WhatsAppConexaoCard() {
  const [info, setInfo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [qr, setQr] = useState(null);
  const [conectando, setConectando] = useState(false);
  const [expirou, setExpirou] = useState(false);
  const timer = useRef(null);
  const ticks = useRef(0);

  const parar = () => {
    clearInterval(timer.current);
    timer.current = null;
    setConectando(false);
  };

  const carregar = async () => {
    setCarregando(true);
    try {
      setInfo(await chamar("whatsapp_status"));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    return () => clearInterval(timer.current);
  }, []);

  const buscarQr = async () => {
    const w = await chamar("whatsapp_qr");
    if (w.estado === "open") return w;
    if (w.qr) setQr(w.qr);
    return null;
  };

  const conectado = (w) => {
    parar();
    setQr(null);
    setInfo(w);
    toast.success("✅ WhatsApp conectado");
  };

  const iniciarConexao = async () => {
    setExpirou(false);
    setConectando(true);
    ticks.current = 0;
    try {
      const jaAberto = await buscarQr();
      if (jaAberto) return conectado(jaAberto);
    } catch (e) {
      toast.error(e.message);
      return parar();
    }
    timer.current = setInterval(async () => {
      ticks.current += 1;
      try {
        const w = await chamar("whatsapp_status");
        if (w.estado === "open") return conectado(w);
        if (ticks.current >= TICKS_MAX) {
          parar();
          setQr(null);
          setExpirou(true);
          return;
        }
        if (ticks.current % TICKS_POR_QR === 0) await buscarQr();
      } catch {
        /* falha momentânea de rede: tenta no próximo ciclo */
      }
    }, INTERVALO_MS);
  };

  const desconectar = async () => {
    if (
      !window.confirm(
        "Desconectar o WhatsApp do SIGO? Os envios automáticos param até conectar de novo."
      )
    )
      return;
    try {
      setInfo(await chamar("whatsapp_desconectar"));
      toast.success("WhatsApp desconectado");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const aberto = info?.estado === "open";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="w-5 h-5 text-emerald-600" /> WhatsApp (envios automáticos)
        </CardTitle>
        <CardDescription>
          Número que envia o link dos treinamentos, a ciência de entrega de EPI e o código de
          recuperação de senha. Se desconectar, o sistema abre o WhatsApp Web com a mensagem pronta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {carregando ? (
          <div className="flex items-center gap-2 text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        ) : !info?.configurado ? (
          <p className="text-sm text-slate-500">
            Servidor do WhatsApp não configurado (secrets EVOLUTION_URL/INSTANCE/APIKEY).
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-600">Status:</span>
              {aberto ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  ● Conectado · {info.nome ? `${info.nome} · ` : ""}
                  {formatarNumero(info.numero)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  ○ Desconectado
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={carregar}
                disabled={conectando}
                title="Atualizar"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {aberto ? (
              <Button variant="outline" size="sm" onClick={desconectar}>
                <LogOut className="w-4 h-4 mr-2" /> Desconectar
              </Button>
            ) : conectando ? (
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div className="w-64 h-64 shrink-0 rounded-lg border bg-white flex items-center justify-center">
                  {qr ? (
                    <img
                      src={qr}
                      alt="QR code para conectar o WhatsApp"
                      className="w-full h-full"
                    />
                  ) : (
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  )}
                </div>
                <ol className="list-decimal pl-5 text-sm text-slate-600 space-y-1">
                  <li>
                    No celular, abra o <b>WhatsApp</b> (ou WhatsApp Business).
                  </li>
                  <li>
                    Toque em <b>⋮ → Dispositivos conectados → Conectar dispositivo</b>.
                  </li>
                  <li>Aponte a câmera para o QR. Ele se renova sozinho.</li>
                  <li className="list-none -ml-5 pt-2">
                    <Button variant="ghost" size="sm" onClick={parar}>
                      Cancelar
                    </Button>
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2">
                {expirou && (
                  <p className="text-sm text-amber-700">
                    O QR não foi lido a tempo. Gere um novo para tentar de novo.
                  </p>
                )}
                <Button onClick={iniciarConexao} className="bg-emerald-600 hover:bg-emerald-700">
                  <QrCode className="w-4 h-4 mr-2" />{" "}
                  {expirou ? "Gerar novo QR" : "Conectar WhatsApp"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
