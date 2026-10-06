import React, { useCallback, useEffect, useRef, useState } from "react";
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
  RefreshCw,
} from "lucide-react";
import {
  chamarPortal,
  sessaoPortal,
  fmtData,
  armazenamentoPortal,
} from "@/components/portal-funcionario/api";
import {
  agruparMatriculas,
  cursoDespublicado,
  ehRenovacao,
  limparRascunhosPortal,
  mensagemDeFalha,
  progressoDoCurso,
} from "@/lib/portal-curso";
import { LoginPortal, TrocarSenhaPortal } from "@/components/portal-funcionario/LoginPortal";
import CursoPortal from "@/components/portal-funcionario/CursoPortal";
import DocumentosPortal from "@/components/portal-funcionario/DocumentosPortal";

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
  // usuário (CPF) do último login, SÓ em memória: a tela de troca de senha o usa para recusar "senha
  // igual ao CPF" antes de enviar. Não vai para o localStorage com a sessão (é dado pessoal).
  const [usuarioDoLogin, setUsuarioDoLogin] = useState("");

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
    // saída pedida pelo aluno: o que o portal guardou no aparelho (posição do vídeo, respostas da prova)
    // sai junto; sessão que caiu mantém, para ele retomar de onde parou ao entrar de novo
    if (!mensagem) limparRascunhosPortal(armazenamentoPortal());
    atualizarSessao(null);
    setAviso(mensagem || "");
    setAlterandoSenha(false);
    setUsuarioDoLogin("");
  };

  const erroSessao = (e) => {
    if (e?.codigo === "TROCAR_SENHA") atualizarSessao({ ...sessao, trocar_senha: true });
    else sair(e?.message || "Sua sessão terminou — entre de novo");
  };

  if (!sessao?.token) {
    return (
      <LoginPortal
        aviso={aviso}
        onEntrar={({ usuario, ...s }) => {
          setAviso("");
          setUsuarioDoLogin(usuario || "");
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
        usuario={usuarioDoLogin}
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
  const [tentando, setTentando] = useState(false);
  // falha ao buscar os dados (rede, servidor) x falha de uma ação do painel (ciência)
  const [erroCarga, setErroCarga] = useState("");
  const [erro, setErro] = useState("");
  // matrícula aberta; `continuar` = o aluno apertou "Começar"/"Continuar": abre direto na próxima aula
  const [aberta, setAberta] = useState(null);
  const [aba, setAba] = useState("cursos");
  // quando os dados (e as URLs assinadas de vídeo/PDF, que valem 3 h) foram pedidos pela última vez
  const carregadoEmRef = useRef(0);

  const carregar = useCallback(async () => {
    try {
      const pedidoEm = Date.now();
      const d = await chamarPortal("dados", {}, token);
      carregadoEmRef.current = pedidoEm;
      setDados(d);
      setErroCarga("");
      return d;
    } catch (e) {
      if (e.codigo === "SESSAO" || e.codigo === "TROCAR_SENHA") onErroSessao(e);
      else setErroCarga(mensagemDeFalha(e));
      return null;
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const tentarDeNovo = async () => {
    setTentando(true);
    await carregar();
    setTentando(false);
  };

  const darCiencia = async (id) => {
    setErro("");
    try {
      await chamarPortal("ciencia", { ciencia_id: id }, token);
      await carregar();
    } catch (e) {
      if (e.codigo === "SESSAO") onErroSessao(e);
      else setErro(mensagemDeFalha(e));
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando seu portal...
        </div>
      </div>
    );
  }

  const item = aberta && dados?.cursos?.find((c) => c.matricula.id === aberta.id);
  if (item) {
    return (
      <CursoPortal
        key={item.matricula.id}
        item={item}
        token={token}
        recarregar={carregar}
        empresaLogoUrl={dados?.empresa_logo_url || null}
        dadosCarregadosEm={() => carregadoEmRef.current}
        abrirProximaAula={aberta.continuar}
        onErroSessao={onErroSessao}
        onVoltar={() => {
          setAberta(null);
          carregar();
        }}
      />
    );
  }

  const cursos = dados?.cursos || [];
  const { andamento, concluidos } = agruparMatriculas(cursos);
  const pendentes = (dados?.ciencias || []).filter((c) => c.status === "pendente");

  const cartaoDoCurso = (c) => {
    const { total, feitas, percentual, semAulas } = progressoDoCurso(c.aulas);
    const m = c.matricula;
    const concluido = m.status === "concluido";
    const renovacao = ehRenovacao(c, cursos);
    const despublicado = !concluido && cursoDespublicado(c.curso);
    return (
      <Card key={m.id}>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800">{c.curso?.nome}</p>
            {(renovacao || despublicado) && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {renovacao && (
                  <Badge variant="outline" className="text-[11px]">
                    Renovação
                  </Badge>
                )}
                {despublicado && (
                  <Badge variant="outline" className="text-[11px] text-amber-700 border-amber-300">
                    Curso despublicado
                  </Badge>
                )}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-0.5">
              {concluido
                ? `Concluído em ${fmtData(m.data_conclusao)}` +
                  (m.proxima_renovacao ? ` · renovar até ${fmtData(m.proxima_renovacao)}` : "")
                : semAulas
                  ? "Este curso ainda não tem aulas cadastradas — avise o RH"
                  : `${feitas}/${total} aulas concluídas`}
            </p>
            {despublicado && (
              <p className="text-xs text-amber-700 mt-0.5">
                O RH despublicou este curso (pode estar em revisão). Em caso de dúvida, fale com o
                RH.
              </p>
            )}
            <div className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${concluido ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ width: `${concluido ? 100 : percentual}%` }}
              />
            </div>
          </div>
          <Button
            onClick={() => setAberta({ id: m.id, continuar: !concluido })}
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
  };

  const tituloGrupo = (texto) => (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 pt-1">{texto}</h2>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0">
            <HardHat className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">
              {dados?.funcionario?.nome_completo || "Portal do Funcionário"}
            </p>
            {dados && (
              <p className="text-xs text-slate-300 truncate">
                {dados.empresa_nome} · Portal do Funcionário
              </p>
            )}
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
        <nav aria-label="Áreas do portal" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ["cursos", "Cursos"],
            ["advertencias", "Advertências"],
            ["documentacao", "Documentação"],
            ["contracheque", "Contracheques"],
            ["folha_ponto", "Folhas de ponto"],
          ].map(([valor, rotulo]) => (
            <Button
              key={valor}
              variant={aba === valor ? "default" : "outline"}
              aria-pressed={aba === valor}
              onClick={() => setAba(valor)}
              className={`h-11 text-xs sm:text-sm ${aba === valor ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-white text-slate-700"}`}
            >
              {rotulo}
            </Button>
          ))}
        </nav>
        {aba !== "cursos" && (
          <DocumentosPortal token={token} categoria={aba} onErroSessao={onErroSessao} />
        )}
        {aba === "cursos" && (
          <>
            {erro && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                <XCircle className="w-4 h-4 shrink-0" /> {erro}
              </div>
            )}

            {/* falha ao buscar os dados: sem a mensagem de "nenhum treinamento" (não é lista vazia) */}
            {!dados ? (
              <Card className="border-red-200">
                <CardContent role="alert" className="p-8 text-center space-y-3">
                  <XCircle className="w-10 h-10 mx-auto text-red-300" />
                  <p className="font-semibold text-slate-800">
                    Não foi possível carregar seus treinamentos
                  </p>
                  <p className="text-sm text-red-700">{erroCarga || mensagemDeFalha(null)}</p>
                  <Button onClick={tentarDeNovo} disabled={tentando} className="bg-slate-900">
                    {tentando ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1" />
                    )}
                    Tentar de novo
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {erroCarga && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
                  >
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">
                      Não foi possível atualizar a lista agora; o que aparece pode estar
                      desatualizado. {erroCarga}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={tentarDeNovo}
                      disabled={tentando}
                      className="shrink-0 bg-white"
                    >
                      {tentando ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-1" />
                      )}
                      Tentar de novo
                    </Button>
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
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmo o recebimento (dou
                            ciência)
                          </Button>
                          <p className="text-[11px] text-amber-700">
                            Ao confirmar, ficam registrados seu login, data/hora e aparelho — vale
                            como assinatura eletrônica (Lei 14.063/2020).
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

                {andamento.length > 0 && concluidos.length > 0 && tituloGrupo("Em andamento")}
                {andamento.map(cartaoDoCurso)}
                {concluidos.length > 0 && tituloGrupo("Concluídos")}
                {concluidos.map(cartaoDoCurso)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
