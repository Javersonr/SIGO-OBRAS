import React, { useEffect, useMemo, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { MessageCircleQuestion, Loader2, Send, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { dispararWhatsApp } from "@/lib/whatsapp";
import { urlPortal } from "@/lib/portal-funcionario-acesso";
import { contarPendentes, ehPendente, filtrarDuvidas, opcoesDoFiltro } from "@/lib/ead-duvidas";

const fmtDataHora = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

const SEM_FILTRO = { cursoId: "", funcionarioId: "" };

/**
 * Uma dúvida: quem perguntou, o quê, e a resposta (com "Editar resposta") ou o campo para responder. Só
 * apresentação: o estado (texto, edição, envio) fica no cartão. Na edição o RH escolhe se o aluno é avisado de
 * novo pelo WhatsApp (a correção de um erro de digitação não precisa de aviso).
 */
export function CartaoDeDuvida({
  duvida: d,
  cursoNome,
  alunoNome,
  aulaTitulo,
  emEdicao,
  texto,
  onTexto,
  salvando,
  podeAvisarDeNovo,
  avisarDeNovo,
  onAvisarDeNovo,
  onEditar,
  onCancelar,
  onSalvar,
}) {
  const respondida = !ehPendente(d);
  return (
    <div className="rounded-md border p-3 space-y-2 text-sm">
      <p className="text-xs text-slate-500">
        {fmtDataHora(d.created_at)} · {alunoNome || "—"} · {cursoNome || "—"}
        {aulaTitulo ? ` · ${aulaTitulo}` : ""}
      </p>
      <p className="text-slate-800 whitespace-pre-wrap">{d.pergunta}</p>
      {respondida && !emEdicao ? (
        <div className="text-emerald-800 bg-emerald-50 rounded p-2">
          <p className="whitespace-pre-wrap">{d.resposta}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs text-emerald-600">
              {d.respondida_por} · {fmtDataHora(d.respondida_em)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-emerald-800"
              onClick={onEditar}
            >
              <Pencil className="w-3.5 h-3.5 mr-1" /> Editar resposta
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2 items-end">
            <Textarea
              rows={emEdicao ? 3 : 2}
              value={texto}
              onChange={(e) => onTexto(e.target.value)}
              placeholder="Resposta ao funcionário…"
            />
            <Button
              size="sm"
              onClick={onSalvar}
              disabled={salvando || !texto.trim()}
              title={emEdicao ? "Salvar a resposta" : "Enviar a resposta"}
            >
              {salvando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          {emEdicao && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {podeAvisarDeNovo ? (
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={avisarDeNovo}
                    onChange={(e) => onAvisarDeNovo(e.target.checked)}
                  />
                  Avisar o aluno de novo pelo WhatsApp
                </label>
              ) : (
                <span />
              )}
              <Button size="sm" variant="ghost" onClick={onCancelar}>
                Cancelar edição
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Canal "Fale com o tutor": dúvidas dos funcionários e respostas do RH/instrutor (T21).
 *
 * - filtros por curso e por aluno (só aparecem os que têm dúvida) e "Ver todas" para incluir as respondidas;
 * - a resposta pode ser editada depois de enviada (por padrão o aluno NÃO é avisado de novo no WhatsApp: o RH
 *   marca a caixa quando a correção muda o sentido);
 * - o número de dúvidas sem resposta sobe para a tela (`onPendentes`), que o mostra no gatilho da aba
 *   "Treinamentos" de RH & Segurança.
 *
 * `funcTodosPorId` dá o nome de quem já saiu da empresa; `funcPorId` (só ativos) decide quem recebe o WhatsApp.
 * `duvidasIniciais` (só para teste): uma lista já carregada, para desenhar o cartão sem ler o banco; em uso normal
 * a tela busca as dúvidas da empresa ativa.
 */
export default function DuvidasTutorCard({
  empresaAtiva,
  cursos,
  funcPorId,
  funcTodosPorId,
  aulas,
  user,
  onPendentes,
  duvidasIniciais,
}) {
  const [duvidas, setDuvidas] = useState(duvidasIniciais ?? []);
  const [carregado, setCarregado] = useState(Boolean(duvidasIniciais));
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState(false);
  const [respostas, setRespostas] = useState({});
  const [editando, setEditando] = useState(null);
  const [avisarDeNovo, setAvisarDeNovo] = useState(false);
  const [salvando, setSalvando] = useState(null);
  const [verRespondidas, setVerRespondidas] = useState(false);
  const [filtros, setFiltros] = useState(SEM_FILTRO);

  // a carga mais nova vence, e a de uma empresa que já não é a ativa é descartada
  const empresaVigenteRef = useRef(empresaAtiva?.id);
  empresaVigenteRef.current = empresaAtiva?.id;
  const cargaRef = useRef(0);

  const carregar = async () => {
    const empresaId = empresaAtiva?.id;
    if (!empresaId) return;
    const minha = ++cargaRef.current;
    setCarregando(true);
    try {
      const ds = await sigo.entities.TreinamentoDuvida.filter({ empresa_id: empresaId });
      if (minha !== cargaRef.current || empresaVigenteRef.current !== empresaId) return;
      setDuvidas(ds);
      setErroCarga(false);
      setCarregado(true);
    } catch (e) {
      if (minha !== cargaRef.current) return;
      console.error(e);
      setErroCarga(true);
    } finally {
      if (minha === cargaRef.current) setCarregando(false);
    }
  };

  useEffect(() => {
    // empresa nova: nada do que estava na tela (lista, filtros, resposta em edição) é dela
    setDuvidas([]);
    setCarregado(false);
    setErroCarga(false);
    setRespostas({});
    setEditando(null);
    setFiltros(SEM_FILTRO);
    if (empresaAtiva?.id) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva?.id]);

  const pendentes = contarPendentes(duvidas);
  // só depois de a lista chegar: antes, o "0" da lista vazia apagaria o número que a tela já mostra
  useEffect(() => {
    if (carregado) onPendentes?.(pendentes);
  }, [carregado, pendentes, onPendentes]);

  const cursoPorId = useMemo(() => new Map((cursos || []).map((c) => [c.id, c])), [cursos]);
  const tituloAula = useMemo(() => new Map((aulas || []).map((a) => [a.id, a.titulo])), [aulas]);
  const nomeDoAluno = (id) => (funcTodosPorId?.get(id) ?? funcPorId?.get(id))?.nome_completo;
  const opcoes = useMemo(
    () =>
      opcoesDoFiltro(duvidas, {
        nomeDoCurso: (id) => cursoPorId.get(id)?.nome,
        nomeDoFuncionario: (id) => (funcTodosPorId?.get(id) ?? funcPorId?.get(id))?.nome_completo,
      }),
    [duvidas, cursoPorId, funcTodosPorId, funcPorId]
  );

  const lista = filtrarDuvidas(duvidas, {
    ...filtros,
    mostrar: verRespondidas ? "todas" : "pendentes",
  });
  const totalDoRecorte = filtrarDuvidas(duvidas, { ...filtros, mostrar: "todas" }).length;
  const filtrando = Boolean(filtros.cursoId || filtros.funcionarioId);

  const iniciarEdicao = (d) => {
    setEditando(d.id);
    setAvisarDeNovo(false);
    setRespostas((r) => ({ ...r, [d.id]: d.resposta || "" }));
  };
  const cancelarEdicao = () => {
    setEditando(null);
    setAvisarDeNovo(false);
  };

  // avisa o aluno pelo WhatsApp (só quem ainda é funcionário ativo e tem telefone)
  const avisarAluno = async (d) => {
    const f = funcPorId?.get(d.funcionario_id);
    if (!f?.telefone) return;
    const curso = cursoPorId.get(d.curso_id);
    const via = await dispararWhatsApp(
      f.telefone,
      `💬 Sua dúvida no curso "${curso?.nome || ""}" foi respondida. Veja no Portal do Funcionário:\n${urlPortal()}`
    );
    if (via === "evolution") toast.success("📲 Funcionário avisado pelo WhatsApp");
  };

  const responder = async (d) => {
    const texto = (respostas[d.id] || "").trim();
    if (!texto) return;
    const edicao = editando === d.id;
    // a mesma resposta de novo não muda nada (e não deve gastar um aviso)
    if (edicao && texto === String(d.resposta || "").trim()) {
      cancelarEdicao();
      return;
    }
    setSalvando(d.id);
    try {
      await sigo.entities.TreinamentoDuvida.update(d.id, {
        resposta: texto,
        respondida_por: user?.full_name || user?.email || null,
        respondida_em: new Date().toISOString(),
      });
      // resposta nova avisa o aluno; correção só avisa se o RH marcou a caixa
      if (!edicao || avisarDeNovo) await avisarAluno(d);
      setRespostas((r) => ({ ...r, [d.id]: "" }));
      cancelarEdicao();
      toast.success(edicao ? "Resposta atualizada" : "Resposta enviada");
      carregar();
    } catch (e) {
      toast.error("Erro: " + (e?.message || e));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircleQuestion className="w-5 h-5" /> Dúvidas dos alunos
          {pendentes > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
              {pendentes} sem resposta
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={carregar}
            disabled={carregando}
            title="Buscar dúvidas novas"
          >
            {carregando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}{" "}
            Atualizar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setVerRespondidas(!verRespondidas)}>
            {verRespondidas ? "Só pendentes" : `Ver todas (${totalDoRecorte})`}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {erroCarga && (
          <p className="text-sm text-red-600" role="alert">
            Não foi possível carregar as dúvidas agora. Toque em Atualizar para tentar de novo.
          </p>
        )}
        {duvidas.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="duvida-filtro-curso" className="text-xs">
                Curso
              </Label>
              <select
                id="duvida-filtro-curso"
                className="mt-0.5 block h-9 max-w-[240px] rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={filtros.cursoId}
                onChange={(e) => setFiltros({ ...filtros, cursoId: e.target.value })}
              >
                <option value="">Todos</option>
                {opcoes.cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.pendentes > 0 ? ` (${c.pendentes} sem resposta)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="duvida-filtro-aluno" className="text-xs">
                Aluno
              </Label>
              <select
                id="duvida-filtro-aluno"
                className="mt-0.5 block h-9 max-w-[240px] rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={filtros.funcionarioId}
                onChange={(e) => setFiltros({ ...filtros, funcionarioId: e.target.value })}
              >
                <option value="">Todos</option>
                {opcoes.alunos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                    {a.pendentes > 0 ? ` (${a.pendentes} sem resposta)` : ""}
                  </option>
                ))}
              </select>
            </div>
            {filtrando && (
              <Button size="sm" variant="ghost" onClick={() => setFiltros(SEM_FILTRO)}>
                Limpar filtros
              </Button>
            )}
          </div>
        )}
        {lista.length === 0 && !erroCarga && (
          <p className="text-sm text-slate-500">
            {filtrando
              ? "Nenhuma dúvida com estes filtros."
              : verRespondidas
                ? "Nenhuma dúvida ainda."
                : "Nenhuma dúvida esperando resposta."}
          </p>
        )}
        {lista.map((d) => (
          <CartaoDeDuvida
            key={d.id}
            duvida={d}
            cursoNome={cursoPorId.get(d.curso_id)?.nome}
            alunoNome={nomeDoAluno(d.funcionario_id)}
            aulaTitulo={d.aula_id ? tituloAula.get(d.aula_id) : null}
            emEdicao={editando === d.id}
            texto={respostas[d.id] || ""}
            onTexto={(valor) => setRespostas((r) => ({ ...r, [d.id]: valor }))}
            salvando={salvando === d.id}
            podeAvisarDeNovo={Boolean(funcPorId?.get(d.funcionario_id)?.telefone)}
            avisarDeNovo={avisarDeNovo}
            onAvisarDeNovo={setAvisarDeNovo}
            onEditar={() => iniciarEdicao(d)}
            onCancelar={cancelarEdicao}
            onSalvar={() => responder(d)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
