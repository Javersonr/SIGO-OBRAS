import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { Button } from "@/components/ui/button";
import {
  CalendarPlus,
  FileDown,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { refDoUpload } from "@/lib/anexo-ref";
import { logoParaPdf, desenharLogo } from "@/lib/pdf-empresa";
import { hojeEmBrasilia } from "@/lib/ead-vencimentos";
import { formatarHoras } from "@/lib/ead-requisitos";
import {
  ACCEPT_LISTA_ASSINADA,
  descricaoDaSessao,
  matriculasParaASessao,
  resumoDaSessao,
  sessaoNoFuturo,
  validarArquivoDaLista,
} from "@/lib/ead-pratica";
import { desenharListaDePresenca, nomeDoArquivoDaLista } from "@/lib/ead-lista-presenca";
import { useConfirmar } from "@/components/shared/ConfirmarDialog";
import SessaoPraticaDialog from "@/components/seguranca/SessaoPraticaDialog";
import PresencaSessaoDialog from "@/components/seguranca/PresencaSessaoDialog";

/**
 * Seção "Sessões práticas" do curso semipresencial (T12). O RH registra cada sessão presencial (data, horário,
 * carga, local e instrutor reais), lança a presença e o resultado de cada matrícula, gera a lista de presença da
 * sessão (PDF) e anexa a lista assinada digitalizada (bucket `treinamentos`). O certificado do semipresencial só
 * sai, pelo servidor, para quem esteve "presente" e teve resultado "satisfatório" numa sessão já realizada.
 *
 * Tudo é gravado direto pelas entidades (RLS por empresa). Quem lançou cada resultado e quando são gravados pelo
 * banco (0143); a trava por PERMISSÃO de quem pode lançar é da T33. Excluir é sempre lógico (deleted_at).
 *
 * `curso` é o curso salvo (com id); `matriculas`, todas as da empresa; `funcPorId`, os funcionários ativos (quem
 * pode entrar na sessão); `funcTodosPorId`, todos (o nome de quem já saiu da empresa continua na sessão);
 * `onAbrirArquivo(ref)` abre a lista assinada.
 */
export default function SessoesPraticasCurso({
  curso,
  empresaAtiva,
  matriculas = [],
  funcPorId,
  funcTodosPorId,
  onAbrirArquivo,
}) {
  const [sessoes, setSessoes] = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [editando, setEditando] = useState(null); // null | { sessao? }
  const [presencaId, setPresencaId] = useState(null);
  const [ocupado, setOcupado] = useState(null); // id da sessão com envio ou PDF em andamento
  const [confirmar, dialogoConfirmar] = useConfirmar();
  const hoje = hojeEmBrasilia();
  const empresaId = empresaAtiva?.id;
  const cursoId = curso?.id;
  // descarta a resposta de uma carga superada (outro curso aberto, outra empresa)
  const cargaRef = useRef(0);

  const carregar = useCallback(async () => {
    if (!empresaId || !cursoId) return;
    const carga = ++cargaRef.current;
    try {
      const ss = await sigo.entities.TreinamentoSessaoPratica.filter({
        empresa_id: empresaId,
        curso_id: cursoId,
      });
      const ids = ss.map((s) => s.id);
      const ps = ids.length
        ? await sigo.entities.TreinamentoPraticaParticipante.filter({
            empresa_id: empresaId,
            sessao_id: { $in: ids },
          })
        : [];
      if (carga !== cargaRef.current) return;
      setSessoes(
        [...ss].sort((a, b) =>
          `${b.data}|${b.hora_inicio}`.localeCompare(`${a.data}|${a.hora_inicio}`)
        )
      );
      setParticipantes(ps);
      setErro(false);
    } catch (e) {
      if (carga !== cargaRef.current) return;
      console.error("[sessões práticas] não carregou:", e);
      setErro(true);
    } finally {
      if (carga === cargaRef.current) setCarregando(false);
    }
  }, [empresaId, cursoId]);

  useEffect(() => {
    setCarregando(true);
    setSessoes([]);
    setParticipantes([]);
    carregar();
  }, [carregar]);

  const participantesDa = useCallback(
    (sessaoId) => participantes.filter((p) => p.sessao_id === sessaoId && !p.deleted_at),
    [participantes]
  );
  const nomeDe = useCallback(
    (funcionarioId) => funcTodosPorId?.get(funcionarioId)?.nome_completo || "Funcionário",
    [funcTodosPorId]
  );
  const sessaoDaPresenca = sessoes.find((s) => s.id === presencaId) ?? null;
  const participantesDaPresenca = useMemo(
    () => (presencaId ? participantesDa(presencaId) : []),
    [presencaId, participantesDa]
  );
  const candidatos = useMemo(
    () =>
      presencaId
        ? matriculasParaASessao({
            cursoId,
            matriculas,
            participantes: participantesDaPresenca,
            funcionarios: funcPorId,
          })
        : [],
    [presencaId, cursoId, matriculas, participantesDaPresenca, funcPorId]
  );

  const falhou = (acao, e) => {
    console.error(`[sessões práticas] ${acao}:`, e);
    toast.error(`Não foi possível ${acao}: ${e?.message || e}`);
    return false;
  };

  const salvarSessao = async (dados) => {
    try {
      if (editando?.sessao) {
        await sigo.entities.TreinamentoSessaoPratica.update(editando.sessao.id, dados);
      } else {
        await sigo.entities.TreinamentoSessaoPratica.create({
          ...dados,
          empresa_id: empresaId,
          curso_id: cursoId,
        });
      }
      toast.success("Sessão prática salva");
      await carregar();
      return true;
    } catch (e) {
      return falhou("salvar a sessão", e);
    }
  };

  const removerSessao = async (sessao) => {
    const resumo = resumoDaSessao(participantesDa(sessao.id));
    const ok = await confirmar({
      titulo: "Remover a sessão prática?",
      texto:
        `${descricaoDaSessao(sessao)}\n\n` +
        (resumo.satisfatorios
          ? `${resumo.satisfatorios} participante(s) com resultado satisfatório deixam de contar para emitir ` +
            "o certificado (o certificado que já foi emitido não muda). "
          : "") +
        "A sessão sai da lista, mas continua guardada no sistema.",
      rotuloConfirmar: "Remover sessão",
      destrutivo: true,
    });
    if (!ok) return;
    try {
      await sigo.entities.TreinamentoSessaoPratica.delete(sessao.id);
      toast.success("Sessão removida");
      await carregar();
    } catch (e) {
      falhou("remover a sessão", e);
    }
  };

  const incluir = async (escolhidas) => {
    try {
      await sigo.entities.TreinamentoPraticaParticipante.bulkCreate(
        escolhidas.map((m) => ({
          empresa_id: empresaId,
          sessao_id: presencaId,
          matricula_id: m.id,
          funcionario_id: m.funcionario_id,
          presente: false,
          resultado: "pendente",
        }))
      );
      toast.success(`${escolhidas.length} participante(s) incluído(s)`);
      await carregar();
      return true;
    } catch (e) {
      return falhou("incluir os participantes", e);
    }
  };

  const salvarLinhas = async (itens) => {
    try {
      for (const { participante, dados } of itens) {
        await sigo.entities.TreinamentoPraticaParticipante.update(participante.id, dados);
      }
      return true;
    } catch (e) {
      return falhou("salvar a presença e o resultado", e);
    } finally {
      await carregar();
    }
  };

  const removerParticipante = async (p) => {
    const ok = await confirmar({
      titulo: "Tirar da sessão?",
      texto:
        `${nomeDe(p.funcionario_id)} sai desta sessão` +
        (p.resultado === "satisfatorio"
          ? " e o resultado satisfatório dela deixa de contar para emitir o certificado (o que já foi emitido não muda)."
          : "."),
      rotuloConfirmar: "Tirar da sessão",
      destrutivo: true,
    });
    if (!ok) return;
    try {
      await sigo.entities.TreinamentoPraticaParticipante.delete(p.id);
      await carregar();
    } catch (e) {
      falhou("tirar o participante da sessão", e);
    }
  };

  const gerarLista = async (sessao) => {
    const lista = participantesDa(sessao.id)
      .map((p) => {
        const f = funcTodosPorId?.get(p.funcionario_id);
        return { nome: f?.nome_completo || "", cpf: f?.cpf || "", funcao: f?.funcao_nome || "" };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (!lista.length) {
      toast.error("Inclua os participantes na sessão antes de gerar a lista de presença");
      return;
    }
    setOcupado(sessao.id);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const logo = await logoParaPdf(empresaAtiva);
      desenharListaDePresenca(doc, {
        sessao,
        curso,
        empresa: empresaAtiva,
        participantes: lista,
        logo,
        desenharLogo,
      });
      doc.save(nomeDoArquivoDaLista(curso, sessao));
    } catch (e) {
      falhou("gerar a lista de presença", e);
    } finally {
      setOcupado(null);
    }
  };

  const anexarLista = async (sessao, arquivo) => {
    const conferido = validarArquivoDaLista(arquivo);
    if (!conferido.ok) {
      toast.error(conferido.erro);
      return;
    }
    setOcupado(sessao.id);
    try {
      const ref = refDoUpload(
        await sigo.integrations.Core.UploadFile({ file: arquivo, bucket: "treinamentos" })
      );
      if (!ref) throw new Error("o envio do arquivo não devolveu a referência");
      await sigo.entities.TreinamentoSessaoPratica.update(sessao.id, { lista_presenca_ref: ref });
      toast.success("Lista assinada anexada à sessão");
      await carregar();
    } catch (e) {
      falhou("anexar a lista assinada", e);
    } finally {
      setOcupado(null);
    }
  };

  const cargaPratica = Number(curso?.carga_pratica_horas) || 0;

  return (
    <div className="border-t pt-3 mt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-800 flex items-center gap-2">
          <Users className="w-4 h-4" /> Sessões práticas ({sessoes.length})
        </h4>
        <Button variant="outline" size="sm" onClick={() => setEditando({})}>
          <CalendarPlus className="w-4 h-4 mr-1" /> Nova sessão
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Parte prática presencial
        {cargaPratica ? ` (${formatarHoras(cargaPratica)} no curso)` : ""}. O certificado de cada
        aluno só é emitido depois que ele estiver marcado como presente, com resultado satisfatório,
        numa sessão já realizada.
      </p>

      {carregando && (
        <p className="text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando as sessões...
        </p>
      )}
      {!carregando && erro && (
        <div role="alert" className="text-sm text-red-700 flex flex-wrap items-center gap-2">
          Não foi possível carregar as sessões práticas.
          <Button type="button" variant="outline" size="sm" onClick={carregar}>
            Tentar de novo
          </Button>
        </div>
      )}
      {!carregando && !erro && sessoes.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma sessão registrada ainda.</p>
      )}

      {sessoes.map((s) => {
        const resumo = resumoDaSessao(participantesDa(s.id));
        const futura = sessaoNoFuturo(s, hoje);
        return (
          <div key={s.id} className="rounded-lg border p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{descricaoDaSessao(s)}</p>
                <p className="text-xs text-slate-500">
                  Instrutor: {s.instrutor_nome}
                  {s.instrutor_qualificacao ? ` · ${s.instrutor_qualificacao}` : ""}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {futura ? "Marcada · " : ""}
                  {resumo.total} participante(s) · {resumo.presentes} presente(s) ·{" "}
                  {resumo.satisfatorios} satisfatório(s) · {resumo.insatisfatorios}{" "}
                  insatisfatório(s)
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditando({ sessao: s })}
                  aria-label="Editar a sessão"
                  title="Editar a sessão"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removerSessao(s)}
                  aria-label="Remover a sessão"
                  title="Remover a sessão"
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPresencaId(s.id)}>
                <Users className="w-4 h-4 mr-1" /> Presença e resultado
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={ocupado === s.id}
                onClick={() => gerarLista(s)}
              >
                {ocupado === s.id ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 mr-1" />
                )}
                Lista de presença (PDF)
              </Button>
              {s.lista_presenca_ref && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onAbrirArquivo(s.lista_presenca_ref)}
                >
                  <FileText className="w-4 h-4 mr-1" /> Ver lista assinada
                </Button>
              )}
              <label className="text-xs border rounded-md px-2 py-1.5 cursor-pointer hover:border-slate-400 flex items-center gap-1">
                <Upload className="w-3 h-3" />
                {s.lista_presenca_ref ? "Trocar lista assinada" : "Anexar lista assinada"}
                <input
                  type="file"
                  accept={ACCEPT_LISTA_ASSINADA}
                  className="hidden"
                  disabled={ocupado === s.id}
                  aria-label="Anexar a lista de presença assinada (PDF ou foto)"
                  onChange={(e) => {
                    anexarLista(s, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        );
      })}

      <SessaoPraticaDialog
        pedido={editando}
        curso={curso}
        hoje={hoje}
        onFechar={() => setEditando(null)}
        onSalvar={salvarSessao}
      />
      <PresencaSessaoDialog
        sessao={sessaoDaPresenca}
        participantes={participantesDaPresenca}
        candidatos={candidatos}
        nomeDe={nomeDe}
        hoje={hoje}
        onFechar={() => setPresencaId(null)}
        onIncluir={incluir}
        onSalvarLinhas={salvarLinhas}
        onRemover={removerParticipante}
      />
      {dialogoConfirmar}
    </div>
  );
}
