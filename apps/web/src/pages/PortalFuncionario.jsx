import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HardHat,
  Loader2,
  CheckCircle2,
  GraduationCap,
  LogOut,
  KeyRound,
  Award,
  XCircle,
} from "lucide-react";
import { chamarPortal, sessaoPortal, fmtData } from "@/components/portal-funcionario/api";
import { LoginPortal, TrocarSenhaPortal } from "@/components/portal-funcionario/LoginPortal";
import CursoPortal from "@/components/portal-funcionario/CursoPortal";

/**
 * Portal do Funcionário — treinamentos EAD, ciência de entregas e certificados.
 *
 * Acesso com USUÁRIO (CPF) e SENHA pessoal criada no primeiro login (o RH
 * gera a provisória na ficha do funcionário). Links antigos com ?token= caem
 * aqui e pedem login — o link sozinho não identifica mais ninguém.
 */
export default function PortalFuncionario() {
  const [sessao, setSessao] = useState(() => sessaoPortal.ler());
  const [aviso, setAviso] = useState("");
  const [alterandoSenha, setAlterandoSenha] = useState(false);

  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.has("token")) {
      u.searchParams.delete("token");
      window.history.replaceState(null, "", u.pathname + u.search);
    }
  }, []);

  const atualizarSessao = (s) => {
    if (s) sessaoPortal.salvar(s);
    else sessaoPortal.limpar();
    setSessao(s);
  };

  const sair = (mensagem) => {
    if (sessao?.token && !mensagem) chamarPortal("logout", {}, sessao.token).catch(() => {});
    atualizarSessao(null);
    setAviso(mensagem || "");
    setAlterandoSenha(false);
  };

  const erroSessao = (e) => {
    if (e?.codigo === "TROCAR_SENHA") atualizarSessao({ ...sessao, trocar_senha: true });
    else sair(e?.message || "Sua sessão terminou — entre de novo");
  };

  if (!sessao?.token) {
    return (
      <LoginPortal
        aviso={aviso}
        onEntrar={(s) => {
          setAviso("");
          atualizarSessao(s);
        }}
      />
    );
  }

  if (sessao.trocar_senha || alterandoSenha) {
    return (
      <TrocarSenhaPortal
        token={sessao.token}
        nome={sessao.nome}
        obrigatoria={!!sessao.trocar_senha}
        onConcluir={(token) => {
          atualizarSessao({ ...sessao, token, trocar_senha: false });
          setAlterandoSenha(false);
        }}
        onCancelar={sessao.trocar_senha ? () => sair() : () => setAlterandoSenha(false)}
      />
    );
  }

  return (
    <PainelPortal
      token={sessao.token}
      onSair={() => sair()}
      onAlterarSenha={() => setAlterandoSenha(true)}
      onErroSessao={erroSessao}
    />
  );
}

function PainelPortal({ token, onSair, onAlterarSenha, onErroSessao }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [matriculaAberta, setMatriculaAberta] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const d = await chamarPortal("dados", {}, token);
      setDados(d);
      setErro("");
      return d;
    } catch (e) {
      if (e.codigo === "SESSAO" || e.codigo === "TROCAR_SENHA") onErroSessao(e);
      else setErro(e.message);
      return null;
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const darCiencia = async (id) => {
    try {
      await chamarPortal("ciencia", { ciencia_id: id }, token);
      await carregar();
    } catch (e) {
      if (e.codigo === "SESSAO") onErroSessao(e);
      else setErro(e.message);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando seus treinamentos...
        </div>
      </div>
    );
  }

  const item = matriculaAberta && dados?.cursos?.find((c) => c.matricula.id === matriculaAberta);
  if (item) {
    return (
      <CursoPortal
        key={item.matricula.id}
        item={item}
        token={token}
        recarregar={carregar}
        onErroSessao={onErroSessao}
        onVoltar={() => {
          setMatriculaAberta(null);
          carregar();
        }}
      />
    );
  }

  const cursos = dados?.cursos || [];
  const pendentes = (dados?.ciencias || []).filter((c) => c.status === "pendente");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
            <HardHat className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{dados?.funcionario?.nome_completo}</p>
            <p className="text-xs text-slate-300 truncate">
              {dados?.empresa_nome} · Portal do Funcionário
            </p>
          </div>
          <button
            onClick={onAlterarSenha}
            className="p-2 rounded-md hover:bg-white/10"
            title="Alterar senha"
            aria-label="Alterar senha"
          >
            <KeyRound className="w-5 h-5" />
          </button>
          <button
            onClick={onSair}
            className="p-2 rounded-md hover:bg-white/10"
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-3">
        {erro && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            <XCircle className="w-4 h-4 shrink-0" /> {erro}
          </div>
        )}

        {pendentes.length > 0 && (
          <Card className="border-amber-300">
            <CardContent className="p-4 space-y-3">
              <p className="font-semibold text-amber-800">
                📋 Você tem entregas aguardando sua ciência:
              </p>
              {pendentes.map((c) => (
                <div key={c.id} className="border rounded-lg p-3 bg-amber-50 space-y-2">
                  <p className="text-sm">
                    <Badge variant="outline" className="mr-2">
                      {c.tipo}
                    </Badge>
                    {c.descricao}
                  </p>
                  {Array.isArray(c.itens) && c.itens.length > 0 && (
                    <ul className="text-sm text-slate-700 list-disc pl-5">
                      {c.itens.map((it, i) => (
                        <li key={i}>
                          {it.quantidade ? `${it.quantidade}× ` : ""}
                          {it.descricao || it.nome}
                          {it.codigo ? ` (${it.codigo})` : ""}
                          {it.ca ? ` · CA ${it.ca}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => darCiencia(c.id)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmo o recebimento (dou ciência)
                  </Button>
                  <p className="text-[11px] text-amber-700">
                    Ao confirmar, ficam registrados seu login, data/hora e aparelho — vale como
                    assinatura eletrônica (Lei 14.063/2020).
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
          const concluido = m.status === "concluido";
          return (
            <Card key={m.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{c.curso?.nome}</p>
                  <p className="text-xs text-slate-500">
                    {concluido
                      ? `Concluído em ${fmtData(m.data_conclusao)}` +
                        (m.proxima_renovacao
                          ? ` · renovar até ${fmtData(m.proxima_renovacao)}`
                          : "")
                      : `${feitas}/${total} aulas concluídas`}
                  </p>
                  <div className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${concluido ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${total ? Math.round((feitas / total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                <Button
                  onClick={() => setMatriculaAberta(m.id)}
                  className={`shrink-0 ${concluido ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-900"}`}
                >
                  {concluido ? (
                    <>
                      <Award className="w-4 h-4 mr-1" /> Certificado
                    </>
                  ) : m.status === "pendente" ? (
                    "Começar"
                  ) : (
                    "Continuar"
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
