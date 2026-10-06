import React, { useEffect, useMemo, useRef, useState } from "react";
import { sigo, supabase, resolveStorageUrl } from "@/api/sigoClient";
import { normalizarTexto } from "@/lib/busca";
import {
  modelosDeTreinamento,
  modelosSemCurso,
  dadosCursoDoModelo,
  faltaModeloCentral,
  mostrarAvisoDeCursoSemVinculo,
  TEXTO_CURSO_SEM_VINCULO,
} from "@/lib/treinamento-catalogo";
import {
  OPCOES_MODALIDADE,
  apresentacaoDoRequisito,
  avisoDaModalidade,
  explicacaoDaModalidade,
  seloDaModalidade,
} from "@/lib/ead-modalidade";
import { normalizarQuestao } from "@/lib/ead-questao";
import { parseDuracao, formatDuracao, lerDuracaoVideo } from "@/lib/ead-duracao";
import {
  modalidadeDoCurso,
  pendenciasParaPublicar,
  requisitosDoCurso,
  tempoObrigatorioSeg,
} from "@/lib/ead-requisitos";
import { numerarAulas, renovacaoParaExibir } from "@/lib/portal-curso";
import {
  reordenarAulas,
  matriculasNovas,
  podeRemoverMatricula,
  textoConfirmarRemocao,
  MSG_REVOGUE_ANTES,
  novoRascunho,
  mesmoFormulario,
  formularioDeAulaSegueOMesmo,
  criarControleDeCarga,
  certificadosPorMatricula,
} from "@/lib/ead-gestao";
import {
  validarArquivoAula,
  subirArquivoComProgresso,
  tipoDeArquivoDaAula,
  dadosDaTrocaDeArquivo,
  ACCEPT_AULA,
} from "@/lib/ead-upload";
import {
  resumirProgressoAula,
  mudouGabarito,
  mudouNotaMinima,
  avisoDeMudanca,
  textoConfirmarRemocaoAula,
} from "@/lib/ead-impacto";
import { srtParaVtt } from "@/lib/legendas";
import { logoParaPdf, desenharLogo } from "@/lib/pdf-empresa";
import { pessoasDosTreinamentos } from "@/lib/instrutores-config";
import { refDeAssinatura } from "@/lib/ead-assinatura";
import { avisarNoPortal } from "@/lib/portal-funcionario-acesso";
import { useConfirmar } from "@/components/shared/ConfirmarDialog";
import MatriculaAuditoriaSheet from "@/components/seguranca/MatriculaAuditoriaSheet";
import DuvidasTutorCard from "@/components/seguranca/DuvidasTutorCard";
import AulaLinhaEad from "@/components/seguranca/AulaLinhaEad";
import AssinaturaCursoCampo from "@/components/seguranca/AssinaturaCursoCampo";
import EnvioProgressoEad from "@/components/seguranca/EnvioProgressoEad";
import PreviaAlunoCurso from "@/components/seguranca/PreviaAlunoCurso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Plus,
  Loader2,
  Trash2,
  GraduationCap,
  MessageCircle,
  Users,
  Video,
  Pencil,
  ClipboardList,
  FileText,
  Award,
  ChevronDown,
  Eye,
  Info,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Gestão da plataforma de treinamentos EAD (cursos → módulos/aulas de vídeo,
 * PDF ou texto → matrículas). O funcionário faz o curso no Portal do
 * Funcionário com login e senha pessoais; aulas em ordem, tempo validado no
 * servidor, prova com tentativas registradas e certificado assinado por ele.
 */

// tabelas só de inclusão (sem deleted_at): o SDK precisa de includeDeleted
const SEM_SOFT_DELETE = { includeDeleted: true };
const NOVA_AULA = {
  titulo: "",
  url: "",
  arquivo: null,
  modulo: "",
  tipo: "video",
  texto: "",
  minutos: "",
  duracao: "",
};
const MAT_FORM_VAZIO = { curso_id: "", funcionario_ids: [] };
// o aviso de matrícula bloqueada tem ~190 caracteres e diz onde clicar: o toast padrão (4 s) some
// antes (o aviso da legenda mantida, ao trocar o vídeo de uma aula, também é longo)
const DURACAO_AVISO_BLOQUEIO_MS = 10000;
// aceita URL completa ou ID puro do YouTube
function extrairYouTubeId(texto) {
  const t = (texto || "").trim();
  const m =
    t.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/) ||
    t.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}

// aulas na ordem da coluna `ordem` (a mesma que o aluno vê no portal)
const porOrdem = (lista) => [...lista].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

// a pergunta inteira pode ser longa: a confirmação mostra só o começo, o bastante para reconhecê-la
const resumoDaPergunta = (pergunta) => {
  const t = String(pergunta || "").trim();
  return t.length > 160 ? `${t.slice(0, 160)}...` : t;
};

const STATUS_BADGE = {
  pendente: "bg-slate-100 text-slate-600",
  em_andamento: "bg-amber-100 text-amber-700 border-amber-200",
  concluido: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

/**
 * Nome escolhido entre as pessoas salvas em Configurações → Treinamentos.
 * Se o nome atual não bate com nenhuma, mostra o campo para digitar.
 */
function SeletorPessoa({ rotulo, pessoas, formatar, nome, onNome, onEscolher }) {
  const atual = (nome || "").trim().toLowerCase();
  const idx = pessoas.findIndex((p) => p.nome.toLowerCase() === atual);
  const valor = !atual ? "" : idx >= 0 ? String(idx) : "_manual";
  return (
    <div>
      <Label className="text-xs">{rotulo}</Label>
      <select
        className="mt-0.5 w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white"
        value={valor}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") onNome("");
          else if (v !== "_manual") onEscolher(pessoas[Number(v)]);
        }}
      >
        <option value="">— escolher dos salvos —</option>
        {pessoas.map((p, i) => (
          <option key={p.nome} value={String(i)}>
            {formatar(p)}
          </option>
        ))}
        <option value="_manual" disabled>
          digitado manualmente
        </option>
      </select>
      {idx < 0 && (
        <Input
          value={nome || ""}
          onChange={(e) => onNome(e.target.value)}
          placeholder="ou digite o nome"
          className="mt-1 h-9"
        />
      )}
    </div>
  );
}

export default function TreinamentosEadTab({ empresaAtiva, user }) {
  const [cursos, setCursos] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [matriculas, setMatriculas] = useState([]);
  const [certificados, setCertificados] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [cursoSel, setCursoSel] = useState(null); // Sheet de edição do curso
  // o curso que está no painel AGORA: uma gravação lenta (vídeo de até 1 GB) termina com o `cursoSel` do
  // clique e confere nesta referência se o RH ainda está no mesmo curso (A2)
  const cursoSelRef = useRef(null);
  cursoSelRef.current = cursoSel;
  const [previaAberta, setPreviaAberta] = useState(false); // "Ver como aluno" (T28)
  const [matriculaDetalheId, setMatriculaDetalheId] = useState(null);
  const [showMatricular, setShowMatricular] = useState(false);
  const [matForm, setMatForm] = useState(MAT_FORM_VAZIO);
  const [buscaFunc, setBuscaFunc] = useState("");
  const [novaAula, setNovaAula] = useState(NOVA_AULA);
  const [subindoProjeto, setSubindoProjeto] = useState(false);
  // Envio de arquivo ou gravação de aula em andamento (T30): { alvo: "nova" | id da aula, arquivo,
  // fase, percentual, enviado, total }. `envioRef` guarda o AbortController (botão Cancelar) e é a
  // trava de um envio por vez: o estado só chega no render seguinte.
  const [envio, setEnvio] = useState(null);
  const envioRef = useRef(null);
  const [questoes, setQuestoes] = useState([]);
  const [todasQuestoes, setTodasQuestoes] = useState([]);
  const [novaQuestao, setNovaQuestao] = useState(null); // {pergunta, opcoes[4], correta}
  const [treinamentosConfig, setTreinamentosConfig] = useState([]);
  const [aulaEditando, setAulaEditando] = useState(null); // {id, titulo, modulo, tipo, minutos}
  const [confirmar, dialogoConfirmar, cancelarConfirmacao] = useConfirmar();

  // Só a 1ª carga (e a troca de empresa) mostra o spinner no lugar da tela. Gravar e recarregar
  // atualiza os dados por baixo, sem desmontar os painéis abertos nem o cartão de dúvidas.
  // `cargas` descarta a resposta de uma carga superada por outra mais nova OU de uma empresa que já
  // não é a ativa. A carga lê a empresa ativa na hora de começar (não a do render que criou a
  // função): uma gravação lenta chama o `recarregar` de um render antigo, e depois da troca de
  // empresa ele não pode consultar nem aplicar os dados da empresa anterior (A2).
  const cargasRef = useRef(null);
  if (!cargasRef.current) cargasRef.current = criarControleDeCarga();
  const cargas = cargasRef.current;
  cargas.definirEmpresa(empresaAtiva?.id);
  const recarregar = async () => {
    const carga = cargas.iniciar();
    if (!carga) return;
    const filtro = { empresa_id: carga.empresaId };
    try {
      const [cs, as, ms, fs, certs, tcfg, qs] = await Promise.all([
        sigo.entities.TreinamentoCurso.filter(filtro),
        sigo.entities.TreinamentoAula.filter(filtro),
        sigo.entities.TreinamentoMatricula.filter(filtro),
        sigo.entities.Funcionario.filter({ ...filtro, ativo: true }),
        sigo.entities.TreinamentoCertificado.filter(filtro, SEM_SOFT_DELETE),
        sigo.entities.Treinamento.filter(filtro),
        sigo.entities.TreinamentoQuestao.filter(filtro),
      ]);
      if (!cargas.vale(carga)) return;
      setCursos(cs);
      setAulas(porOrdem(as));
      setMatriculas(ms);
      setFuncionarios(fs);
      setCertificados(certs);
      setTreinamentosConfig(tcfg);
      setTodasQuestoes(qs);
    } catch (e) {
      if (!cargas.vale(carga)) return;
      console.error(e);
      toast.error("Erro ao carregar treinamentos");
    } finally {
      if (cargas.vale(carga)) setCarregando(false);
    }
  };

  // fechou o editor (ou trocou de empresa): a prévia do curso não fica armada para o próximo
  useEffect(() => {
    if (!cursoSel?.id) setPreviaAberta(false);
  }, [cursoSel?.id]);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    // Empresa nova: tudo o que estava aberto ou digitado era da anterior (curso, trilha, matrícula,
    // seleção de funcionários, editores de aula e de questão, formulário de nova aula) e um pedido
    // de confirmação pendente executaria a ação com os dados antigos. Um envio de arquivo em
    // andamento também era da empresa anterior: é cancelado.
    envioRef.current?.abort();
    setCarregando(true);
    setCursoSel(null);
    setMatriculaDetalheId(null);
    setShowMatricular(false);
    setMatForm(MAT_FORM_VAZIO);
    setBuscaFunc("");
    setNovaQuestao(null);
    setAulaEditando(null);
    setNovaAula(NOVA_AULA);
    cancelarConfirmacao();
    recarregar();
  }, [empresaAtiva?.id]);

  // Uma gravação de cada tipo por vez (clique duplo não cria curso/questão/matrícula em dobro) e
  // qualquer falha vira toast: nenhuma rejeição escapa dos botões. `tarefa` lança para falhar.
  const gravandoRef = useRef(new Set());
  const [gravando, setGravando] = useState(() => new Set());
  const gravar = async (chave, erroPrefixo, tarefa) => {
    if (gravandoRef.current.has(chave)) return false;
    gravandoRef.current.add(chave);
    setGravando(new Set(gravandoRef.current));
    try {
      await tarefa();
      return true;
    } catch (e) {
      console.error(erroPrefixo, e);
      toast.error(`${erroPrefixo}: ${e?.message || e}`);
      return false;
    } finally {
      gravandoRef.current.delete(chave);
      setGravando(new Set(gravandoRef.current));
    }
  };

  // ------------------------------------------------- envio de arquivos (T30)
  // Tela fechada no meio do envio: cancela (o arquivo não ficaria ligado a nenhuma aula).
  useEffect(() => () => envioRef.current?.abort(), []);
  // Fechar a aba ou recarregar a página no meio de um envio perderia o arquivo: o navegador pergunta.
  const enviandoArquivo = !!envio?.arquivo;
  useEffect(() => {
    if (!enviandoArquivo) return undefined;
    const avisar = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [enviandoArquivo]);

  // Começa um envio e devolve o controle de cancelamento. Quem chama confere `envioRef.current`
  // antes (um envio por vez). `arquivo` vazio = só gravação (aula de texto ou YouTube).
  const iniciarEnvio = (alvo, arquivo) => {
    const controle = new AbortController();
    envioRef.current = controle;
    setEnvio({
      alvo,
      arquivo: arquivo?.name || null,
      fase: arquivo ? "enviando" : "gravando",
      percentual: 0,
      enviado: 0,
      total: arquivo?.size || 0,
    });
    return controle;
  };
  const mudarFaseDoEnvio = (fase) => setEnvio((atual) => (atual ? { ...atual, fase } : atual));
  const encerrarEnvio = (controle) => {
    if (envioRef.current !== controle) return;
    envioRef.current = null;
    setEnvio(null);
  };
  const cancelarEnvio = () => envioRef.current?.abort();
  // Fechar o painel do curso no meio do envio cancelaria o arquivo: o RH confirma antes.
  const fecharCurso = async () => {
    if (envio?.arquivo && envio.fase !== "gravando") {
      const sair = await confirmar({
        titulo: "Cancelar o envio do arquivo?",
        texto:
          `O arquivo "${envio.arquivo}" ainda está sendo enviado. Se fechar agora, o envio é ` +
          "cancelado e será preciso começar de novo.",
        rotuloConfirmar: "Cancelar envio e fechar",
        rotuloCancelar: "Continuar enviando",
        destrutivo: true,
      });
      if (!sair) return;
      cancelarEnvio();
    }
    setCursoSel(null);
  };

  // Sobe o arquivo para o bucket das aulas com a barra de progresso; devolve a referência
  // "bucket/caminho" (é ela que vai para o banco). O percentual só vai para a tela quando muda de
  // número inteiro: a tela é grande e não precisa redesenhar a cada pacote.
  const subirArquivo = async (controle, arquivo) => {
    let ultimo = -1;
    const res = await subirArquivoComProgresso({
      supabase,
      chaveApi: import.meta.env.VITE_SUPABASE_ANON_KEY,
      bucket: "treinamentos",
      arquivo,
      sinal: controle.signal,
      aoProgredir: ({ enviado, total, percentual }) => {
        if (percentual === ultimo) return;
        ultimo = percentual;
        setEnvio((atual) =>
          atual && envioRef.current === controle ? { ...atual, percentual, enviado, total } : atual
        );
      },
    });
    return res.ref;
  };

  // Avisos de impacto (T30): antes de mudar gabarito, nota mínima ou aulas, o RH vê quantos alunos
  // estão no meio do curso. Os números vêm do banco na hora (a lista da tela pode estar velha: o
  // aluno abre o curso a qualquer momento). Se a consulta falhar, a mudança não segue (toast).
  const impactoNoBanco = async (cursoId, aulaId) => {
    const empresaId = cargas.empresaAtual();
    if (!empresaId) throw new Error("sem empresa ativa");
    const [mats, progressos] = await Promise.all([
      sigo.entities.TreinamentoMatricula.filter({ empresa_id: empresaId, curso_id: cursoId }),
      aulaId
        ? sigo.entities.TreinamentoProgresso.filter(
            { empresa_id: empresaId, aula_id: aulaId },
            SEM_SOFT_DELETE
          )
        : Promise.resolve([]),
    ]);
    return resumirProgressoAula(mats, progressos);
  };
  // true = pode seguir (nada a avisar, ou o RH confirmou); false = parar (cancelou ou falhou)
  const confirmarImpacto = async (tipo, { cursoId, aulaId, ehVideo }) => {
    try {
      const impacto = await impactoNoBanco(cursoId, aulaId);
      const aviso = avisoDeMudanca(tipo, { ...impacto, ehVideo });
      return aviso ? await confirmar(aviso) : true;
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível conferir os alunos em andamento: " + (e?.message || e));
      return false;
    }
  };

  const aulasDoCurso = (cursoId) => aulas.filter((a) => a.curso_id === cursoId);
  const requisitos = (curso) =>
    requisitosDoCurso({
      curso,
      aulas: aulasDoCurso(curso.id),
      questoes: todasQuestoes.filter((q) => q.curso_id === curso.id),
    });
  // o que impede PUBLICAR e MATRICULAR (D3: o curso de apoio publica e matricula; só não emite)
  const pendenciasCurso = (curso) => pendenciasParaPublicar(requisitos(curso));
  const funcPorId = useMemo(() => new Map(funcionarios.map((f) => [f.id, f])), [funcionarios]);
  // um certificado por matrícula, consultado por linha da tabela sem varrer a lista a cada vez
  const certPorMatricula = useMemo(() => certificadosPorMatricula(certificados), [certificados]);
  const pessoas = useMemo(
    () => pessoasDosTreinamentos(treinamentosConfig, empresaAtiva?.id),
    [treinamentosConfig, empresaAtiva?.id]
  );
  // Troca a imagem da assinatura (T29) só no formulário que a pediu: o envio é lento e o RH pode ter aberto
  // outro curso enquanto ele terminava (a mesma regra do PDF do projeto pedagógico).
  const trocarAssinatura = (campo) => {
    const formulario = cursoSel;
    return (ref) =>
      setCursoSel((atual) =>
        mesmoFormulario(atual, formulario) ? { ...atual, [campo]: ref } : atual
      );
  };

  // ------------------------------------------------------------------ cursos
  const salvarCurso = async () => {
    // curso novo exige o treinamento do cadastro central; curso antigo, gravado sem ele, pode ser salvo
    // sem o vínculo (o RH precisa despublicar, preencher o instrutor e marcar a modalidade, C4)
    const gravado = cursoSel?.id ? cursos.find((c) => c.id === cursoSel.id) : null;
    if (faltaModeloCentral(cursoSel, gravado)) {
      toast.error("Selecione o treinamento do cadastro central antes de salvar o curso");
      return;
    }
    if (!cursoSel?.nome?.trim()) {
      toast.error("Dê um nome ao curso");
      return;
    }
    const dados = {
      empresa_id: empresaAtiva.id,
      modelo_treinamento_id: cursoSel.modelo_treinamento_id || null,
      modalidade: cursoSel.modalidade || "ead",
      nome: cursoSel.nome.trim(),
      codigo: cursoSel.codigo || null,
      descricao: cursoSel.descricao || null,
      validade_meses: cursoSel.validade_meses ? Number(cursoSel.validade_meses) : null,
      carga_horaria_horas: cursoSel.carga_horaria_horas
        ? Number(cursoSel.carga_horaria_horas)
        : null,
      nota_minima: cursoSel.nota_minima ? Number(cursoSel.nota_minima) : 70,
      max_tentativas:
        cursoSel.max_tentativas === "" || cursoSel.max_tentativas == null
          ? 3
          : Number(cursoSel.max_tentativas),
      intervalo_tentativa_min:
        cursoSel.intervalo_tentativa_min === "" || cursoSel.intervalo_tentativa_min == null
          ? 30
          : Number(cursoSel.intervalo_tentativa_min),
      conteudo_programatico: cursoSel.conteudo_programatico?.trim() || null,
      responsavel_tecnico_nome: cursoSel.responsavel_tecnico_nome?.trim() || null,
      responsavel_tecnico_registro: cursoSel.responsavel_tecnico_registro?.trim() || null,
      instrutor_nome: cursoSel.instrutor_nome?.trim() || null,
      instrutor_qualificacao: cursoSel.instrutor_qualificacao?.trim() || null,
      // só referência válida da empresa (T29): link do Base44, URL ou arquivo de outra pasta viram null
      instrutor_assinatura_ref: refDeAssinatura(cursoSel.instrutor_assinatura_ref, empresaAtiva.id),
      responsavel_tecnico_assinatura_ref: refDeAssinatura(
        cursoSel.responsavel_tecnico_assinatura_ref,
        empresaAtiva.id
      ),
      tutor_telefone: cursoSel.tutor_telefone?.trim() || null,
      ativo: cursoSel.ativo !== false,
    };
    if (
      dados.ativo &&
      !cursos.find((c) => c.id === cursoSel.id)?.ativo &&
      pendenciasCurso({ ...cursoSel, ...dados }).length
    ) {
      toast.error("Regularize os requisitos do curso antes de publicar");
      return;
    }
    // nota mínima nova com alunos no meio do curso: o RH vê quantos antes de salvar (T30)
    if (
      mudouNotaMinima(gravado, dados.nota_minima) &&
      !(await confirmarImpacto("nota_minima", { cursoId: cursoSel.id }))
    ) {
      return;
    }
    await gravar("curso", "Erro ao salvar o curso", async () => {
      if (cursoSel.id) {
        await sigo.entities.TreinamentoCurso.update(cursoSel.id, dados);
      } else {
        const novo = await sigo.entities.TreinamentoCurso.create(dados);
        // O id do curso novo só vai para o formulário que foi gravado. Painel fechado durante a
        // gravação: não reabre um curso em branco. Painel reaberto com OUTRO curso: o id não pode ir
        // para ele, senão o próximo "Salvar curso" gravaria os dados de outro curso por cima do novo.
        setCursoSel((atual) =>
          mesmoFormulario(atual, cursoSel) ? { ...atual, id: novo.id } : atual
        );
      }
      toast.success("Curso salvo");
      recarregar();
    });
  };

  const adicionarAula = async () => {
    if (envioRef.current) return; // um envio por vez (o botão também fica desabilitado)
    if (!cursoSel?.id) {
      toast.error("Salve o curso antes de adicionar aulas");
      return;
    }
    if (!novaAula.titulo.trim()) {
      toast.error("Informe o título da aula");
      return;
    }
    const empresaId = empresaAtiva.id;
    const cursoId = cursoSel.id;
    const ordem = Math.max(0, ...aulasDoCurso(cursoId).map((a) => a.ordem || 0)) + 1;
    const base = {
      empresa_id: empresaId,
      curso_id: cursoId,
      ordem,
      titulo: novaAula.titulo.trim(),
      modulo: novaAula.modulo.trim() || null,
      tipo: novaAula.tipo,
    };
    // PDF/texto: o tempo mínimo com a aula aberta é o que conta para concluir
    const tempoMinimo = Math.round(Number(novaAula.minutos || 0) * 60);

    // Tudo o que dá para conferir sem gravar nada vem antes de subir qualquer arquivo (T30)
    let youtube = null;
    if (novaAula.tipo !== "video") {
      if (!tempoMinimo) {
        toast.error("Informe o tempo mínimo de leitura (minutos)");
        return;
      }
      if (novaAula.tipo === "pdf") {
        if (!novaAula.arquivo) {
          toast.error("Anexe o PDF da aula");
          return;
        }
      } else if (!novaAula.texto.trim()) {
        toast.error("Escreva o texto da aula");
        return;
      }
    } else if (!novaAula.arquivo) {
      const ytId = extrairYouTubeId(novaAula.url);
      if (!ytId) {
        toast.error("Anexe o vídeo OU informe um link válido do YouTube");
        return;
      }
      const duracao_seg = parseDuracao(novaAula.duracao);
      if (!duracao_seg) {
        toast.error("Informe a duração do vídeo em mm:ss");
        return;
      }
      youtube = { ytId, duracao_seg };
    }
    const arquivo = novaAula.tipo === "texto" ? null : novaAula.arquivo;
    if (arquivo) {
      const valido = validarArquivoAula(arquivo, novaAula.tipo === "pdf" ? "pdf" : "video");
      if (!valido.ok) {
        toast.error(valido.erro);
        return;
      }
    }
    if (!(await confirmarImpacto("aula_nova", { cursoId }))) return;
    if (envioRef.current) return; // outro envio começou enquanto o aviso estava na tela

    const controle = iniciarEnvio("nova", arquivo);
    try {
      let dados;
      if (novaAula.tipo === "pdf") {
        const arquivo_ref = await subirArquivo(controle, arquivo);
        mudarFaseDoEnvio("gravando");
        dados = {
          fonte: "upload",
          youtube_id: null,
          arquivo_ref,
          conteudo_texto: null,
          duracao_seg: tempoMinimo,
        };
      } else if (novaAula.tipo === "texto") {
        dados = {
          fonte: "upload",
          youtube_id: null,
          arquivo_ref: null,
          conteudo_texto: novaAula.texto.trim(),
          duracao_seg: tempoMinimo,
        };
      } else if (arquivo) {
        // HOSPEDAGEM PRÓPRIA: vídeo sobe pro bucket 'treinamentos' (até 1GB)
        mudarFaseDoEnvio("lendo");
        const duracao_seg = await lerDuracaoVideo(arquivo);
        mudarFaseDoEnvio("enviando");
        const video_ref = await subirArquivo(controle, arquivo);
        mudarFaseDoEnvio("gravando");
        dados = { fonte: "upload", video_ref, youtube_id: null, duracao_seg };
      } else {
        dados = { fonte: "youtube", youtube_id: youtube.ytId, duracao_seg: youtube.duracao_seg };
      }
      await sigo.entities.TreinamentoAula.create({ ...base, ...dados });
      // mantém o módulo para a próxima aula do mesmo bloco, a menos que a tela já seja outra durante o
      // envio: empresa diferente (o formulário já foi limpo e o módulo é da empresa anterior) ou OUTRO
      // curso aberto (o formulário é compartilhado e tem o que o RH digitou lá: não é sobrescrito)
      if (
        formularioDeAulaSegueOMesmo({
          mesmaEmpresa: cargas.mesmaEmpresa(empresaId),
          cursoAberto: cursoSelRef.current,
          cursoDoEnvio: cursoSel,
        })
      ) {
        setNovaAula({ ...NOVA_AULA, modulo: novaAula.modulo, tipo: novaAula.tipo });
      }
      toast.success("Aula adicionada");
      recarregar();
    } catch (e) {
      if (e?.cancelado) toast.info("Envio cancelado. Nenhuma aula foi criada.");
      else toast.error("Erro ao adicionar aula: " + (e?.message || e));
    } finally {
      encerrarEnvio(controle);
    }
  };

  const abrirReferencia = async (ref) => {
    // aba aberta já no clique: depois do await o navegador bloquearia o pop-up
    const aba = window.open("", "_blank");
    try {
      const url = await resolveStorageUrl(ref);
      if (!url || !aba) throw new Error("sem URL");
      aba.opener = null;
      aba.location.href = url;
    } catch (e) {
      console.error(e);
      aba?.close();
      toast.error("Não foi possível abrir o arquivo");
    }
  };

  const enviarProjetoPedagogico = async (arquivo) => {
    if (!arquivo || !cursoSel?.id) return;
    setSubindoProjeto(true);
    try {
      const res = await sigo.integrations.Core.UploadFile({
        file: arquivo,
        bucket: "treinamentos",
      });
      const ref = `${res.bucket}/${res.path}`;
      await sigo.entities.TreinamentoCurso.update(cursoSel.id, { projeto_pedagogico_ref: ref });
      // só no curso que recebeu o PDF: se outro foi aberto durante o envio, ele não é trocado
      setCursoSel((atual) =>
        mesmoFormulario(atual, cursoSel) ? { ...atual, projeto_pedagogico_ref: ref } : atual
      );
      toast.success("Projeto pedagógico anexado — o aluno vê no portal");
      recarregar();
    } catch (e) {
      toast.error("Erro ao anexar: " + (e?.message || e));
    } finally {
      setSubindoProjeto(false);
    }
  };

  const abrirVideo = async (aula) => {
    if (aula.tipo === "pdf") return abrirReferencia(aula.arquivo_ref);
    if (aula.fonte !== "upload") {
      window.open(`https://youtu.be/${aula.youtube_id}`, "_blank", "noopener");
      return;
    }
    // aba aberta já no clique: depois do await o navegador bloquearia o pop-up
    const aba = window.open("", "_blank");
    try {
      const url = await resolveStorageUrl(aula.video_ref);
      if (!url || !aba) throw new Error("sem URL");
      aba.opener = null;
      aba.location.href = url;
    } catch (e) {
      console.error(e);
      aba?.close();
      toast.error("Não foi possível abrir o vídeo");
    }
  };

  const enviarLegenda = async (aula, arquivo) => {
    if (!arquivo) return;
    try {
      const vtt = srtParaVtt(await arquivo.text());
      const nome = arquivo.name.replace(/\.(srt|vtt)$/i, "") + ".vtt";
      const res = await sigo.integrations.Core.UploadFile({
        file: new File([vtt], nome, { type: "text/vtt" }),
        bucket: "treinamentos",
      });
      await sigo.entities.TreinamentoAula.update(aula.id, {
        legenda_ref: `${res.bucket}/${res.path}`,
      });
      toast.success("Legenda anexada");
      recarregar();
    } catch (e) {
      toast.error("Erro ao anexar legenda: " + (e?.message || e));
    }
  };

  // Renumera o curso inteiro (1..n), uma gravação por vez: o banco não tem transação aqui, então
  // se uma falhar a tela avisa e recarrega o que de fato ficou gravado.
  const moverAula = async (aula, dir) => {
    const plano = reordenarAulas(aulasDoCurso(cursoSel.id), aula.id, dir);
    if (!plano) return;
    await gravar("ordem", "Erro ao mudar a ordem das aulas", async () => {
      const novaOrdem = new Map(plano.mudancas.map((m) => [m.id, m.ordem]));
      // a lista já mostra a nova ordem enquanto grava; o recarregar abaixo confirma. Uma carga que
      // ainda está a caminho (começou antes) traria a ordem velha: descarta.
      cargas.descartarPendentes();
      setAulas((atuais) =>
        porOrdem(
          atuais.map((a) => (novaOrdem.has(a.id) ? { ...a, ordem: novaOrdem.get(a.id) } : a))
        )
      );
      try {
        for (const { id, ordem } of plano.mudancas) {
          await sigo.entities.TreinamentoAula.update(id, { ordem });
        }
      } finally {
        recarregar();
      }
    });
  };

  // Abre o editor da aula. Aula do YouTube mostra o link para trocar (a duração segue no mesmo editor).
  const abrirEdicaoAula = (a) =>
    setAulaEditando({
      id: a.id,
      tipo: a.tipo || "video",
      youtube: (a.tipo || "video") === "video" && a.fonte === "youtube",
      link: a.fonte === "youtube" && a.youtube_id ? `https://youtu.be/${a.youtube_id}` : "",
      titulo: a.titulo || "",
      modulo: a.modulo || "",
      minutos: a.duracao_seg ? Math.round(a.duracao_seg / 60) : "",
      duracao: a.duracao_seg ? formatDuracao(a.duracao_seg) : "",
    });

  const salvarAulaEdicao = async () => {
    const titulo = (aulaEditando.titulo || "").trim();
    if (!titulo) {
      toast.error("Informe o título da aula");
      return;
    }
    const original = aulas.find((a) => a.id === aulaEditando.id);
    const ehVideo = aulaEditando.tipo === "video";
    const patch = { titulo, modulo: (aulaEditando.modulo || "").trim() || null };
    if (!ehVideo) {
      const seg = Math.round(Number(aulaEditando.minutos || 0) * 60);
      if (!seg) {
        toast.error("Informe o tempo mínimo de leitura (minutos)");
        return;
      }
      patch.duracao_seg = seg;
    } else {
      const seg = parseDuracao(aulaEditando.duracao);
      if (!seg) {
        toast.error("Informe a duração do vídeo em mm:ss");
        return;
      }
      patch.duracao_seg = seg;
    }
    // aula do YouTube: o link novo troca o vídeo, mantendo a posição (T30)
    if (aulaEditando.youtube) {
      const ytId = extrairYouTubeId(aulaEditando.link);
      if (!ytId) {
        toast.error("Informe um link válido do YouTube");
        return;
      }
      if (ytId !== original?.youtube_id) patch.youtube_id = ytId;
    }
    // vídeo ou tempo novo com alunos no meio desta aula: o RH vê quantos antes de salvar (T30)
    const mudouVideo = !!patch.youtube_id;
    const mudouTempo = !!original && patch.duracao_seg !== (Number(original.duracao_seg) || 0);
    if (
      original &&
      (mudouVideo || mudouTempo) &&
      !(await confirmarImpacto(mudouVideo ? "aula_trocar" : "aula_duracao", {
        cursoId: original.curso_id,
        aulaId: original.id,
        ehVideo,
      }))
    ) {
      return;
    }
    const editada = aulaEditando; // o editor que o RH mandou salvar
    await gravar("aula", "Erro ao salvar a aula", async () => {
      await sigo.entities.TreinamentoAula.update(editada.id, patch);
      // fecha só o editor que foi gravado: se o RH abriu o de outra aula durante a gravação, o que
      // ele já digitou lá não se perde
      setAulaEditando((atual) => (mesmoFormulario(atual, editada) ? null : atual));
      toast.success("Aula atualizada");
      recarregar();
    });
  };

  // Troca o arquivo de uma aula de vídeo hospedado ou de PDF, mantendo a posição, o título e o
  // módulo (T30). O arquivo antigo continua no Storage: é o que quem já assistiu viu.
  const trocarArquivoDaAula = async (aula, arquivo) => {
    const tipoArquivo = tipoDeArquivoDaAula(aula);
    if (!arquivo || !tipoArquivo) return;
    if (envioRef.current) {
      toast.info("Já há um envio em andamento. Espere terminar ou cancele.");
      return;
    }
    const valido = validarArquivoAula(arquivo, tipoArquivo);
    if (!valido.ok) {
      toast.error(valido.erro);
      return;
    }
    const ehVideo = tipoArquivo === "video";
    const cursoId = aula.curso_id;
    if (!(await confirmarImpacto("aula_trocar", { cursoId, aulaId: aula.id, ehVideo }))) return;
    if (envioRef.current) return; // outro envio começou enquanto o aviso estava na tela

    const controle = iniciarEnvio(aula.id, arquivo);
    try {
      let duracao_seg = null;
      if (ehVideo) {
        mudarFaseDoEnvio("lendo");
        duracao_seg = await lerDuracaoVideo(arquivo);
        mudarFaseDoEnvio("enviando");
      }
      const ref = await subirArquivo(controle, arquivo);
      mudarFaseDoEnvio("gravando");
      await sigo.entities.TreinamentoAula.update(
        aula.id,
        dadosDaTrocaDeArquivo(tipoArquivo, ref, duracao_seg)
      );
      // o editor desta aula, se estiver aberto, passa a mostrar a duração nova: salvar o título
      // depois não pode devolver a duração do vídeo antigo
      if (ehVideo) {
        setAulaEditando((atual) =>
          atual?.id === aula.id ? { ...atual, duracao: formatDuracao(duracao_seg) } : atual
        );
      }
      if (ehVideo && aula.legenda_ref) {
        toast.success(
          "Vídeo trocado na mesma posição. A legenda anterior continua anexada: se o conteúdo " +
            "mudou, troque a legenda pelo menu da aula.",
          { duration: DURACAO_AVISO_BLOQUEIO_MS }
        );
      } else {
        toast.success(`${ehVideo ? "Vídeo" : "PDF"} trocado na mesma posição`);
      }
      recarregar();
    } catch (e) {
      if (e?.cancelado) toast.info("Envio cancelado. A aula continua com o arquivo anterior.");
      else toast.error("Erro ao trocar o arquivo: " + (e?.message || e));
    } finally {
      encerrarEnvio(controle);
    }
  };

  const removerAula = async (aula) => {
    if (envio?.alvo === aula.id) {
      toast.info("Esta aula está recebendo um arquivo. Cancele o envio antes de removê-la.");
      return;
    }
    // quantos alunos têm progresso nesta aula (e quantos estão no meio do curso) vai no aviso
    let impacto;
    try {
      impacto = await impactoNoBanco(aula.curso_id, aula.id);
    } catch (e) {
      console.error(e);
      toast.error(
        "Não foi possível conferir o progresso dos alunos nesta aula: " + (e?.message || e)
      );
      return;
    }
    const confirmado = await confirmar({
      titulo: "Remover a aula?",
      texto: textoConfirmarRemocaoAula({ tituloAula: aula.titulo, ...impacto }),
      rotuloConfirmar: "Remover aula",
      destrutivo: true,
    });
    if (!confirmado) return;
    await gravar(`remover-aula-${aula.id}`, "Erro ao remover a aula", async () => {
      await sigo.entities.TreinamentoAula.delete(aula.id);
      setAulaEditando((atual) => (atual?.id === aula.id ? null : atual));
      recarregar();
    });
  };

  // ------------------------------------------------------------ avaliação
  // curso cujas questões estão na tela: resposta de outro curso (aberto antes) é descartada
  const cursoDasQuestoesRef = useRef(null);
  const carregarQuestoes = async (cursoId) => {
    // empresa ativa agora (não a do render que criou esta função): ver `cargas`
    const empresaId = cargas.empresaAtual();
    if (!empresaId) return;
    try {
      const qs = await sigo.entities.TreinamentoQuestao.filter({
        empresa_id: empresaId,
        curso_id: cursoId,
      });
      if (!cargas.mesmaEmpresa(empresaId)) return; // trocou de empresa durante a consulta
      setTodasQuestoes((anteriores) => [
        ...anteriores.filter((q) => q.curso_id !== cursoId),
        ...qs,
      ]);
      if (cursoDasQuestoesRef.current === cursoId) setQuestoes(porOrdem(qs));
    } catch (e) {
      if (!cargas.mesmaEmpresa(empresaId)) return;
      console.error(e);
      toast.error("Erro ao carregar as questões do curso: " + (e?.message || e));
    }
  };

  useEffect(() => {
    cursoDasQuestoesRef.current = cursoSel?.id || null;
    if (cursoSel?.id) carregarQuestoes(cursoSel.id);
    else setQuestoes([]);
  }, [cursoSel?.id]);

  const salvarQuestao = async () => {
    const resultado = normalizarQuestao(novaQuestao);
    if (!resultado.ok) {
      toast.error(resultado.erro);
      return;
    }
    const dados = resultado.dados;
    const aberta = novaQuestao; // o formulário que o RH mandou salvar
    // gabarito diferente com alunos no meio do curso: o RH vê quantos antes de salvar (T30)
    if (
      novaQuestao.id &&
      mudouGabarito(
        questoes.find((q) => q.id === novaQuestao.id),
        dados
      ) &&
      !(await confirmarImpacto("gabarito", { cursoId: cursoSel.id }))
    ) {
      return;
    }
    // falhou: o formulário continua aberto, com o que o RH digitou
    await gravar("questao", "Erro ao salvar a questão", async () => {
      if (novaQuestao.id) {
        await sigo.entities.TreinamentoQuestao.update(novaQuestao.id, dados);
      } else {
        await sigo.entities.TreinamentoQuestao.create({
          ...dados,
          empresa_id: empresaAtiva.id,
          curso_id: cursoSel.id,
          ordem: Math.max(0, ...questoes.map((q) => Number(q.ordem) || 0)) + 1,
        });
      }
      // fecha só o formulário que foi gravado (outro, aberto durante a gravação, fica como está)
      setNovaQuestao((atual) => (mesmoFormulario(atual, aberta) ? null : atual));
      carregarQuestoes(cursoSel.id);
    });
  };

  const excluirQuestao = async (q) => {
    const confirmado = await confirmar({
      titulo: "Excluir esta questão?",
      texto: q.pergunta
        ? `Excluir da avaliação a questão "${resumoDaPergunta(q.pergunta)}"?`
        : "Excluir esta questão da avaliação?",
      rotuloConfirmar: "Excluir questão",
      destrutivo: true,
    });
    if (!confirmado) return;
    await gravar(`excluir-questao-${q.id}`, "Erro ao excluir a questão", async () => {
      await sigo.entities.TreinamentoQuestao.delete(q.id);
      setNovaQuestao((atual) => (atual?.id === q.id ? null : atual));
      carregarQuestoes(cursoSel.id);
    });
  };

  // -------------------------------------------------------------- matrículas
  const matricular = async () => {
    if (!matForm.curso_id || matForm.funcionario_ids.length === 0) {
      toast.error("Escolha o curso e ao menos um funcionário");
      return;
    }
    const curso = cursos.find((c) => c.id === matForm.curso_id);
    if (!curso || curso.ativo === false || pendenciasCurso(curso).length) {
      toast.error("Este curso ainda tem requisitos pendentes para novas matrículas");
      return;
    }
    const empresaId = empresaAtiva.id;
    const { novas, ignorados } = matriculasNovas({
      matriculas,
      cursoId: matForm.curso_id,
      funcionarioIds: matForm.funcionario_ids,
      empresaId,
    });
    if (novas.length === 0) {
      toast.info("Todos os funcionários escolhidos já estão matriculados neste curso");
      return;
    }
    // Um INSERT só: ou entram todos ou nenhum. Falhou: o painel segue aberto com a seleção, e a
    // lista é recarregada para a nova tentativa partir do que de fato ficou no banco.
    await gravar(
      "matricula",
      "Erro ao matricular (a lista foi atualizada; confira antes de tentar de novo)",
      async () => {
        try {
          await sigo.entities.TreinamentoMatricula.bulkCreate(novas);
        } finally {
          recarregar();
        }
        toast.success(
          `${novas.length} matrícula(s) criada(s)` +
            (ignorados ? " (já matriculados ignorados)" : "")
        );
        // trocou de empresa durante a gravação: o painel e a seleção já são os da empresa nova
        if (cargas.mesmaEmpresa(empresaId)) {
          setShowMatricular(false);
          setMatForm(MAT_FORM_VAZIO);
        }
      }
    );
  };

  // Avisa o funcionário (WhatsApp) com o link do portal; se ele ainda não tem
  // login, o acesso é criado agora e a senha provisória vai junto.
  const avisarFuncionario = async (funcionario) => {
    if (!funcionario) return;
    try {
      const r = await avisarNoPortal(
        funcionario,
        "🎓 Você tem treinamentos no Portal do Funcionário."
      );
      await navigator.clipboard.writeText(r.texto).catch(() => {});
      if (r.via === "evolution") toast.success("📲 Aviso enviado pelo WhatsApp");
      else if (!funcionario.telefone)
        toast.info("Sem telefone — mensagem copiada para você entregar");
      if (r.credenciais) toast.success(`Acesso criado · usuário ${r.credenciais.usuario}`);
    } catch (e) {
      toast.error("Erro ao avisar: " + (e?.message || e));
    }
  };

  // Matrícula com certificado emitido e não revogado não sai (T20): o curso sumiria do portal e da
  // tela, mas o certificado seguiria válido na consulta pública. Antes de apagar, o certificado é
  // lido de novo no banco: o aluno pode ter assinado depois da última carga da tela.
  const removerMatricula = async (m) => {
    const cert = certPorMatricula.get(m.id);
    if (!podeRemoverMatricula(m, cert)) {
      // aviso esperado, não erro; fica na tela o tempo de ler onde clicar
      toast.warning(MSG_REVOGUE_ANTES, { duration: DURACAO_AVISO_BLOQUEIO_MS });
      return;
    }
    const texto = textoConfirmarRemocao({
      matricula: m,
      certificado: cert,
      nomeFuncionario: funcPorId.get(m.funcionario_id)?.nome_completo,
      nomeCurso: cursos.find((c) => c.id === m.curso_id)?.nome,
    });
    const confirmado = await confirmar({
      titulo: "Remover matrícula",
      texto,
      rotuloConfirmar: "Remover matrícula",
      destrutivo: true,
    });
    if (!confirmado) return;
    await gravar(`remover-matricula-${m.id}`, "Erro ao remover a matrícula", async () => {
      const [atual] = await sigo.entities.TreinamentoCertificado.filter(
        { empresa_id: empresaAtiva.id, matricula_id: m.id },
        SEM_SOFT_DELETE
      );
      if (!podeRemoverMatricula(m, atual)) {
        toast.warning(MSG_REVOGUE_ANTES, { duration: DURACAO_AVISO_BLOQUEIO_MS });
        recarregar();
        return;
      }
      await sigo.entities.TreinamentoMatricula.delete(m.id);
      toast.success("Matrícula removida");
      recarregar();
    });
  };

  // Lista de Presença: uma folha por DIA de treinamento, padrão 10h/dia
  // (curso de 40h = 4 dias; carga restante no último dia).
  const HORAS_DIA = 10;
  const gerarListasPresenca = async (curso) => {
    try {
      // a folha diz "Modalidade: EAD" e declara conteúdo feito na plataforma: só vale para curso EAD (T8)
      if (modalidadeDoCurso(curso) !== "ead") {
        toast.error(
          "A lista de presença do portal vale só para curso EAD. Este curso é de apoio ou " +
            "semipresencial: use a lista da turma presencial."
        );
        return;
      }
      const carga = Number(curso.carga_horaria_horas) || 0;
      if (!carga) {
        toast.error("Informe a carga horária do curso antes de gerar as listas");
        return;
      }
      const participantes = matriculas
        .filter((m) => m.curso_id === curso.id)
        .map((m) => funcPorId.get(m.funcionario_id))
        .filter(Boolean);
      if (!participantes.length) {
        toast.error("Nenhum funcionário matriculado neste curso");
        return;
      }
      const inicioStr = prompt("Data do 1º dia de treinamento (DD/MM/AAAA):");
      if (!inicioStr) return;
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(inicioStr.trim());
      if (!m) {
        toast.error("Data inválida — use DD/MM/AAAA");
        return;
      }
      const instrutor = prompt("Nome do instrutor (opcional):") || "";
      const inicio = new Date(+m[3], +m[2] - 1, +m[1]);
      const dias = Math.ceil(carga / HORAS_DIA);

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const W = doc.internal.pageSize.getWidth();
      const logo = await logoParaPdf(empresaAtiva);

      const aulasCurso = aulasDoCurso(curso.id);

      for (let dia = 0; dia < dias; dia++) {
        if (dia > 0) doc.addPage();
        const data = new Date(inicio);
        data.setDate(data.getDate() + dia);
        const horasDoDia = Math.min(HORAS_DIA, carga - dia * HORAS_DIA);
        let y = desenharLogo(doc, logo, 10);
        if (!logo) y = 16;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("LISTA DE PRESENÇA — TREINAMENTO", W / 2, y + 2, { align: "center" });
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        y += 9;
        doc.text(
          `${empresaAtiva?.razao_social || empresaAtiva?.nome || ""} — CNPJ ${empresaAtiva?.cnpj || "-"}` +
            `${empresaAtiva?.endereco ? ` — ${empresaAtiva.endereco}` : ""}`,
          15,
          y
        );
        y += 6;
        doc.text(
          `Treinamento: ${curso.nome}${curso.codigo ? ` (${curso.codigo})` : ""} — Carga horária total: ${carga}h — ` +
            `Modalidade: EAD (plataforma própria, com registro eletrônico individual de conclusão)`,
          15,
          y,
          { maxWidth: W - 30 }
        );
        y += 10;
        doc.text(
          `Dia ${dia + 1} de ${dias} — Data: ${data.toLocaleDateString("pt-BR")} — ` +
            `Horário: 07:00 às 12:00 / 13:00 às 18:00 — Carga do dia: ${horasDoDia}h`,
          15,
          y
        );
        y += 6;
        if (aulasCurso.length) {
          const conteudo = "Conteúdo programático: " + aulasCurso.map((a) => a.titulo).join("; ");
          const linhas = doc.splitTextToSize(conteudo, W - 30);
          doc.text(linhas, 15, y);
          y += linhas.length * 4.5 + 3;
        }
        // cabeçalho da tabela
        doc.setFont("helvetica", "bold");
        doc.text("Nº", 15, y);
        doc.text("Nome", 24, y);
        doc.text("CPF", 92, y);
        doc.text("Função", 124, y);
        doc.text("Assinatura", 158, y);
        doc.setFont("helvetica", "normal");
        y += 2.5;
        doc.line(15, y, W - 15, y);
        y += 7;
        participantes.forEach((f, i) => {
          if (y > 262) {
            doc.addPage();
            y = 20;
          }
          doc.text(String(i + 1), 15, y);
          doc.text((f.nome_completo || "").slice(0, 38), 24, y);
          doc.text(f.cpf || "-", 92, y);
          doc.text((f.funcao_nome || "-").slice(0, 20), 124, y, { maxWidth: 32 });
          doc.line(158, y + 1, W - 15, y + 1);
          y += 9;
        });
        y = Math.max(y + 8, 240);
        if (y > 262) {
          doc.addPage();
          y = 40;
        }
        doc.setFontSize(8);
        doc.text(
          "Declaramos que os participantes acima realizaram o conteúdo do dia na modalidade EAD, " +
            "com controle individual de acesso e conclusão registrado eletronicamente na plataforma.",
          15,
          y,
          { maxWidth: W - 30 }
        );
        doc.setFontSize(9);
        y += 14;
        doc.line(15, y, 95, y);
        doc.text(`Instrutor${instrutor ? `: ${instrutor}` : ""}`, 15, y + 5);
        doc.line(115, y, W - 15, y);
        doc.text(curso.responsavel_tecnico_nome || "Responsável técnico", 115, y + 5, {
          maxWidth: W - 130,
        });
        if (curso.responsavel_tecnico_registro) {
          doc.text(curso.responsavel_tecnico_registro, 115, y + 10, { maxWidth: W - 130 });
        }
      }
      doc.save(
        `Lista_Presenca_${(curso.nome || "curso").replace(/\s+/g, "_")}_${inicioStr.replaceAll("/", "-")}.pdf`
      );
      toast.success(`${dias} folha(s) de presença gerada(s) — ${HORAS_DIA}h/dia`);
    } catch (erro) {
      console.error("Erro ao gerar listas de presença:", erro);
      toast.error("Não foi possível gerar as listas de presença. Tente novamente.");
    }
  };

  // ------------------------------------------------------------------ UI
  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando treinamentos...
      </div>
    );
  }

  const funcsFiltrados = funcionarios.filter(
    (f) => !buscaFunc || normalizarTexto(f.nome_completo).includes(normalizarTexto(buscaFunc))
  );

  return (
    <div className="space-y-6">
      {/* Cursos */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="w-5 h-5" /> Cursos ({cursos.length})
          </CardTitle>
          <Button
            size="sm"
            onClick={() =>
              setCursoSel(novoRascunho({ nome: "", validade_meses: "", ativo: false }))
            }
            className="bg-slate-900 hover:bg-slate-800"
          >
            <Plus className="w-4 h-4 mr-1" /> Novo curso
          </Button>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <p className="col-span-full text-sm text-slate-500">
            Cadastre o curso e envie vídeos, apostilas PDF e questões nesta área. Para enviar
            contracheques e folhas de ponto, abra a ficha em Funcionários.{" "}
            <a
              href="/PortalFuncionario"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-700 underline"
            >
              Abrir Portal do Funcionário
            </a>
          </p>
          <details className="group col-span-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
              <Info className="w-4 h-4 shrink-0" />
              Curso EAD ou treinamento por função: qual é a diferença?
              <ChevronDown className="ml-auto w-4 h-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-2">
              <p>
                <strong>Treinamentos por função</strong> (Configurações → Funções → Treinamentos)
                dizem quais treinamentos cada função exige. É onde o RH registra as datas e os
                certificados dos treinamentos já feitos, presenciais ou importados.
              </p>
              <p>
                <strong>Cursos EAD</strong> (esta tela) são o conteúdo online que o funcionário faz
                no Portal do Funcionário: aulas em ordem, prova e certificado emitido e conferível
                pelo próprio sistema.
              </p>
              <p>
                Os dois partem do mesmo cadastro central de treinamentos (nome, código, carga
                horária e validade), mas são registros separados: concluir um curso EAD não lança o
                treinamento na função nem substitui o certificado de um treinamento presencial.
              </p>
            </div>
          </details>
          {modelosSemCurso(treinamentosConfig, cursos).length > 0 && (
            <div className="col-span-full rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
              <p className="text-sm font-medium">
                Treinamentos do cadastro central ainda sem curso no portal
              </p>
              <p className="text-xs text-slate-600">
                Selecione um treinamento para preparar suas aulas e avaliação. O curso começa como
                rascunho.
              </p>
              <select
                aria-label="Preparar curso do cadastro central"
                className="w-full h-10 rounded border bg-white px-2 text-sm"
                value=""
                onChange={(e) => {
                  const modelo = treinamentosConfig.find((t) => t.id === e.target.value);
                  if (modelo)
                    setCursoSel(novoRascunho({ ...dadosCursoDoModelo(modelo), ativo: false }));
                }}
              >
                <option value="">Selecionar treinamento...</option>
                {modelosSemCurso(treinamentosConfig, cursos).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.codigo ? `${t.codigo} — ` : ""}
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          {cursos.map((c) => {
            const qtdAulas = aulasDoCurso(c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setCursoSel(c)}
                className="text-left rounded-lg border border-slate-200 p-3 hover:border-slate-400 bg-white"
              >
                <p className="font-medium text-slate-800">{c.nome}</p>
                {c.ativo !== false && pendenciasCurso(c).length > 0 && (
                  <Badge variant="outline" className="mt-1 text-amber-700">
                    Publicado com pendências
                  </Badge>
                )}
                {/* o apoio leva um selo neutro, não pendência: publica e matricula, só não emite (D3) */}
                {seloDaModalidade(c.modalidade) && (
                  <Badge variant="outline" className="mt-1 ml-1 text-slate-700">
                    {seloDaModalidade(c.modalidade).texto}
                  </Badge>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  {c.codigo ? c.codigo + " · " : ""}
                  {qtdAulas} aula(s)
                  {c.validade_meses ? ` · validade ${c.validade_meses} meses` : ""}
                </p>
                {c.ativo === false && (
                  <Badge variant="outline" className="mt-2 text-amber-700 border-amber-300">
                    Rascunho · não publicado
                  </Badge>
                )}
              </button>
            );
          })}
          {cursos.length === 0 && (
            <p className="text-sm text-slate-500 col-span-full py-4">
              Nenhum curso ainda — crie o primeiro e adicione as aulas (vídeo próprio ou link do
              YouTube não listado).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Matrículas */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-5 h-5" /> Matrículas ({matriculas.length})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowMatricular(true)}>
            <Plus className="w-4 h-4 mr-1" /> Matricular funcionários
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3 font-medium">Funcionário</th>
                <th className="py-2 pr-3 font-medium">Curso</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Conclusão</th>
                <th className="py-2 pr-3 font-medium">Próx. renovação</th>
                <th className="py-2 pr-3 font-medium">Certificado</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {matriculas.map((m) => {
                const f = funcPorId.get(m.funcionario_id);
                const curso = cursos.find((c) => c.id === m.curso_id);
                // a tabela tem centenas de linhas iguais: o rótulo diz de quem é a matrícula
                const quem = f?.nome_completo ? ` de ${f.nome_completo}` : "";
                // certificado da matrícula: buscado uma vez por linha (a coluna e a lixeira usam o mesmo)
                const cert = certPorMatricula.get(m.id);
                const bloqueada = !podeRemoverMatricula(m, cert);
                return (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      {f?.nome_completo || "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{curso?.nome || "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className={STATUS_BADGE[m.status] || ""}>
                        {m.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{fmtData(m.data_conclusao)}</td>
                    {/* curso de apoio não renova (D3), mesmo que a matrícula antiga tenha a data */}
                    <td className="py-2 pr-3 text-slate-600">
                      {fmtData(renovacaoParaExibir(curso, m))}
                    </td>
                    <td className="py-2 pr-3">
                      {cert ? (
                        <Badge
                          variant="outline"
                          className={
                            cert.revogado_em
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }
                        >
                          <Award className="w-3 h-3 mr-1" />
                          {cert.revogado_em ? "revogado" : cert.codigo}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          title="Detalhes: tempo por aula, tentativas, trilha de acessos e certificado"
                          aria-label={`Detalhes da matrícula${quem}`}
                          onClick={() => setMatriculaDetalheId(m.id)}
                        >
                          <ClipboardList className="w-4 h-4 text-slate-600 hover:text-slate-900" />
                        </button>
                        <button
                          type="button"
                          title="Avisar pelo WhatsApp (cria o acesso ao portal se ainda não tiver)"
                          aria-label={`Avisar no WhatsApp${quem}`}
                          onClick={() => avisarFuncionario(f)}
                        >
                          <MessageCircle className="w-4 h-4 text-emerald-600 hover:text-emerald-800" />
                        </button>
                        <button
                          type="button"
                          title={
                            bloqueada
                              ? "Revogue o certificado antes de remover a matrícula"
                              : "Remover matrícula"
                          }
                          aria-label={
                            bloqueada
                              ? `Remover matrícula${quem} (bloqueado: revogue o certificado antes)`
                              : `Remover matrícula${quem}`
                          }
                          aria-disabled={bloqueada}
                          onClick={() => removerMatricula(m)}
                        >
                          <Trash2
                            className={
                              bloqueada
                                ? "w-4 h-4 text-slate-300 cursor-not-allowed"
                                : "w-4 h-4 text-slate-400 hover:text-red-500"
                            }
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {matriculas.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    Nenhuma matrícula — matricule funcionários num curso pra liberar o portal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <DuvidasTutorCard
        empresaAtiva={empresaAtiva}
        cursos={cursos}
        funcPorId={funcPorId}
        aulas={aulas}
        user={user}
      />

      {(() => {
        const m = matriculas.find((x) => x.id === matriculaDetalheId);
        if (!m) return null;
        return (
          <MatriculaAuditoriaSheet
            matricula={m}
            curso={cursos.find((c) => c.id === m.curso_id)}
            funcionario={funcPorId.get(m.funcionario_id)}
            aulas={aulasDoCurso(m.curso_id)}
            empresaAtiva={empresaAtiva}
            onClose={() => setMatriculaDetalheId(null)}
            // liberar tentativa e revogar o certificado avisam a tela na hora (T18): a lixeira da
            // matrícula depende do certificado estar revogado (T20), e não precisa mais recarregar
            // tudo a cada vez que o painel fecha
            onMudou={recarregar}
          />
        );
      })()}

      {/* Sheet: curso + aulas */}
      <Sheet open={!!cursoSel} onOpenChange={(v) => !v && fecharCurso()}>
        <SheetContent className="left-0 w-full max-w-none overflow-y-auto sm:max-w-none lg:left-0 lg:w-full">
          {cursoSel && (
            <>
              <SheetHeader>
                <SheetTitle>{cursoSel.id ? "Editar curso" : "Novo curso"}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <div className="rounded-lg border bg-sky-50 p-3 space-y-2">
                  <Label>Treinamento do cadastro central</Label>
                  <select
                    aria-label="Treinamento do cadastro central"
                    className="w-full h-10 rounded border bg-white px-2 text-sm"
                    value={cursoSel.modelo_treinamento_id || ""}
                    onChange={(e) => {
                      const modelo = treinamentosConfig.find((t) => t.id === e.target.value);
                      setCursoSel((prev) =>
                        modelo
                          ? { ...prev, ...dadosCursoDoModelo(modelo) }
                          : { ...prev, modelo_treinamento_id: null }
                      );
                    }}
                  >
                    <option value="">Selecionar treinamento...</option>
                    {modelosDeTreinamento(treinamentosConfig).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.codigo ? `${t.codigo} — ` : ""}
                        {t.nome}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-600">
                    Cursos vinculados recebem nome, código, carga horária, validade e conteúdo do
                    cadastro em Configurações → Funções → Treinamentos. Edite esses dados lá para
                    atualizar todas as funções.
                  </p>
                  {mostrarAvisoDeCursoSemVinculo(
                    cursoSel,
                    cursos.find((c) => c.id === cursoSel.id)
                  ) && <p className="text-xs text-slate-600">{TEXTO_CURSO_SEM_VINCULO}</p>}
                </div>
                <div className="rounded-lg border p-3 space-y-2">
                  <Label htmlFor="curso-modalidade">Modalidade</Label>
                  <select
                    id="curso-modalidade"
                    className="w-full h-10 rounded border bg-white px-2 text-sm"
                    value={cursoSel.modalidade || "ead"}
                    onChange={(e) => setCursoSel({ ...cursoSel, modalidade: e.target.value })}
                  >
                    {OPCOES_MODALIDADE.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-600">
                    {explicacaoDaModalidade(cursoSel.modalidade)}
                  </p>
                  {avisoDaModalidade(cursoSel) && (
                    <p role="alert" className="text-xs text-amber-700">
                      {avisoDaModalidade(cursoSel)}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Nome do curso</Label>
                    <Input
                      disabled={!!cursoSel.modelo_treinamento_id}
                      value={cursoSel.nome || ""}
                      onChange={(e) => setCursoSel({ ...cursoSel, nome: e.target.value })}
                      placeholder="Ex.: NR10 Básico"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Código</Label>
                    <Input
                      disabled={!!cursoSel.modelo_treinamento_id}
                      value={cursoSel.codigo || ""}
                      onChange={(e) => setCursoSel({ ...cursoSel, codigo: e.target.value })}
                      placeholder="Ex.: TTRP-0011"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Validade (meses)</Label>
                    <Input
                      type="number"
                      disabled={!!cursoSel.modelo_treinamento_id}
                      value={cursoSel.validade_meses || ""}
                      onChange={(e) => setCursoSel({ ...cursoSel, validade_meses: e.target.value })}
                      placeholder="Ex.: 24"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Carga horária (h)</Label>
                    <Input
                      type="number"
                      disabled={!!cursoSel.modelo_treinamento_id}
                      value={cursoSel.carga_horaria_horas || ""}
                      onChange={(e) =>
                        setCursoSel({ ...cursoSel, carga_horaria_horas: e.target.value })
                      }
                      placeholder="Ex.: 40"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Nota mínima da avaliação (%)</Label>
                    <Input
                      type="number"
                      value={cursoSel.nota_minima ?? 70}
                      onChange={(e) => setCursoSel({ ...cursoSel, nota_minima: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Descrição</Label>
                    <Input
                      value={cursoSel.descricao || ""}
                      onChange={(e) => setCursoSel({ ...cursoSel, descricao: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Máx. de tentativas na prova (0 = sem limite)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={cursoSel.max_tentativas ?? 3}
                      onChange={(e) => setCursoSel({ ...cursoSel, max_tentativas: e.target.value })}
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Intervalo p/ revisar entre tentativas (min)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={cursoSel.intervalo_tentativa_min ?? 30}
                      onChange={(e) =>
                        setCursoSel({ ...cursoSel, intervalo_tentativa_min: e.target.value })
                      }
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <SeletorPessoa
                      rotulo="Responsável técnico"
                      pessoas={pessoas.responsaveis}
                      formatar={(p) => p.nome + (p.registro ? ` · ${p.registro}` : "")}
                      nome={cursoSel.responsavel_tecnico_nome}
                      onNome={(v) => setCursoSel({ ...cursoSel, responsavel_tecnico_nome: v })}
                      onEscolher={(p) =>
                        setCursoSel({
                          ...cursoSel,
                          responsavel_tecnico_nome: p.nome,
                          responsavel_tecnico_registro:
                            p.registro || cursoSel.responsavel_tecnico_registro || "",
                          // a imagem é da pessoa escolhida: a do catálogo, ou nenhuma (nunca a de quem estava antes)
                          responsavel_tecnico_assinatura_ref: p.assinatura_ref || null,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Registro do responsável (CREA/MTE)</Label>
                    <Input
                      value={cursoSel.responsavel_tecnico_registro || ""}
                      onChange={(e) =>
                        setCursoSel({ ...cursoSel, responsavel_tecnico_registro: e.target.value })
                      }
                      placeholder="Ex.: CREA-MG 123456/D"
                      className="mt-0.5"
                    />
                  </div>
                  <AssinaturaCursoCampo
                    rotulo="Assinatura do responsável técnico"
                    valor={cursoSel.responsavel_tecnico_assinatura_ref}
                    empresaId={empresaAtiva.id}
                    onChange={trocarAssinatura("responsavel_tecnico_assinatura_ref")}
                  />
                  <div>
                    <SeletorPessoa
                      rotulo="Instrutor"
                      pessoas={pessoas.instrutores}
                      formatar={(p) => p.nome + (p.qualificacao ? ` · ${p.qualificacao}` : "")}
                      nome={cursoSel.instrutor_nome}
                      onNome={(v) => setCursoSel({ ...cursoSel, instrutor_nome: v })}
                      onEscolher={(p) =>
                        setCursoSel({
                          ...cursoSel,
                          instrutor_nome: p.nome,
                          instrutor_qualificacao:
                            p.qualificacao || cursoSel.instrutor_qualificacao || "",
                          instrutor_assinatura_ref: p.assinatura_ref || null,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Qualificação do instrutor</Label>
                    <Input
                      value={cursoSel.instrutor_qualificacao || ""}
                      onChange={(e) =>
                        setCursoSel({ ...cursoSel, instrutor_qualificacao: e.target.value })
                      }
                      placeholder="Ex.: Eng. de Segurança do Trabalho"
                      className="mt-0.5"
                    />
                  </div>
                  <AssinaturaCursoCampo
                    rotulo="Assinatura do instrutor"
                    valor={cursoSel.instrutor_assinatura_ref}
                    empresaId={empresaAtiva.id}
                    onChange={trocarAssinatura("instrutor_assinatura_ref")}
                  />
                  <div className="col-span-2">
                    <Label className="text-xs">
                      WhatsApp do tutor (recebe as dúvidas dos alunos)
                    </Label>
                    <Input
                      value={cursoSel.tutor_telefone || ""}
                      onChange={(e) => setCursoSel({ ...cursoSel, tutor_telefone: e.target.value })}
                      placeholder="(38) 99999-9999"
                      className="mt-0.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">
                      Conteúdo programático do certificado (um item por linha; vazio = usa as aulas)
                    </Label>
                    <Textarea
                      rows={4}
                      disabled={!!cursoSel.modelo_treinamento_id}
                      value={cursoSel.conteudo_programatico || ""}
                      onChange={(e) =>
                        setCursoSel({ ...cursoSel, conteudo_programatico: e.target.value })
                      }
                      className="mt-0.5"
                    />
                  </div>
                  {cursoSel.id && (
                    <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-lg border p-3">
                      <FileText className="w-4 h-4 text-slate-600" />
                      <span className="text-sm flex-1">
                        Projeto pedagógico (PDF){" "}
                        <span className="text-xs text-slate-500">— o aluno baixa pelo portal</span>
                      </span>
                      {cursoSel.projeto_pedagogico_ref && (
                        <button
                          type="button"
                          className="text-xs text-sky-600 hover:underline"
                          onClick={() => abrirReferencia(cursoSel.projeto_pedagogico_ref)}
                        >
                          ver atual
                        </button>
                      )}
                      <label className="text-xs border rounded-md px-2 py-1 cursor-pointer hover:border-slate-400">
                        {subindoProjeto ? (
                          <Loader2 className="w-3 h-3 animate-spin inline" />
                        ) : cursoSel.projeto_pedagogico_ref ? (
                          "trocar PDF"
                        ) : (
                          "anexar PDF"
                        )}
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            enviarProjetoPedagogico(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  )}
                  <div className="col-span-2 flex items-start gap-3 rounded-lg border p-3">
                    <Switch
                      id="curso-publicado"
                      checked={cursoSel.ativo !== false}
                      disabled={cursoSel.ativo === false && pendenciasCurso(cursoSel).length > 0}
                      onCheckedChange={(v) => {
                        if (v && pendenciasCurso(cursoSel).length)
                          return toast.error("Regularize os requisitos antes de publicar");
                        setCursoSel({ ...cursoSel, ativo: v });
                      }}
                    />
                    <div>
                      <Label htmlFor="curso-publicado" className="text-sm">
                        Publicado — liberado para matrícula
                      </Label>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Deixe desligado enquanto o responsável técnico revisa vídeos, questões e
                        gabarito.
                      </p>
                    </div>
                  </div>
                  <div className="col-span-2 rounded-lg border p-3 space-y-2">
                    <h3 className="font-semibold text-sm">
                      Requisitos para publicar e emitir certificado
                    </h3>
                    <p className="text-xs text-slate-500">
                      Conteúdo medido:{" "}
                      {formatDuracao(tempoObrigatorioSeg(aulasDoCurso(cursoSel.id)))} (min:seg) ·
                      Carga declarada: {cursoSel.carga_horaria_horas || 0} h
                    </p>
                    <ul className="text-xs space-y-1">
                      {requisitos(cursoSel)
                        .filter((r) => !r.ok)
                        .map((r) => {
                          const { prefixo, tom } = apresentacaoDoRequisito(r);
                          return (
                            <li
                              key={r.codigo}
                              className={tom === "alerta" ? "text-amber-700" : "text-slate-500"}
                            >
                              {prefixo}
                              {r.texto}
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={salvarCurso}
                    disabled={gravando.has("curso")}
                    className="bg-slate-900 hover:bg-slate-800"
                  >
                    {gravando.has("curso") && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                    Salvar curso
                  </Button>
                  {cursoSel.id && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPreviaAberta(true)}
                      title="Abre o curso como o aluno vê (todas as aulas liberadas, prova com gabarito), sem matricular ninguém e sem gravar nada"
                    >
                      <Eye className="w-4 h-4 mr-1" /> Ver como aluno
                    </Button>
                  )}
                </div>

                {cursoSel.id && (
                  <div className="space-y-2 border-t pt-4">
                    <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                      <Video className="w-4 h-4" /> Aulas
                    </h4>
                    {numerarAulas(aulasDoCurso(cursoSel.id)).map((a, i, lista) => {
                      const novoModulo = a.modulo && a.modulo !== lista[i - 1]?.modulo;
                      return (
                        <React.Fragment key={a.id}>
                          {novoModulo && (
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 pt-2">
                              {a.modulo}
                            </p>
                          )}
                          <AulaLinhaEad
                            aula={a}
                            primeira={i === 0}
                            ultima={i === lista.length - 1}
                            ordemOcupada={gravando.has("ordem")}
                            envioEmCurso={!!envio}
                            onSubir={() => moverAula(a, -1)}
                            onDescer={() => moverAula(a, 1)}
                            onEditar={() => abrirEdicaoAula(a)}
                            onVer={() => abrirVideo(a)}
                            onRemover={() => removerAula(a)}
                            onTrocarArquivo={(arquivo) => trocarArquivoDaAula(a, arquivo)}
                            onLegenda={(arquivo) => enviarLegenda(a, arquivo)}
                          />
                          {envio?.alvo === a.id && (
                            <EnvioProgressoEad envio={envio} onCancelar={cancelarEnvio} />
                          )}
                          {aulaEditando?.id === a.id && (
                            <div className="rounded-lg border p-3 space-y-2 bg-white">
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  placeholder="Título"
                                  value={aulaEditando.titulo}
                                  onChange={(e) =>
                                    setAulaEditando({ ...aulaEditando, titulo: e.target.value })
                                  }
                                  className="h-9 col-span-2"
                                />
                                {aulaEditando.youtube && (
                                  <Input
                                    placeholder="Link do YouTube (não listado)"
                                    aria-label="Link do vídeo no YouTube"
                                    value={aulaEditando.link}
                                    onChange={(e) =>
                                      setAulaEditando({ ...aulaEditando, link: e.target.value })
                                    }
                                    className="h-9 col-span-2"
                                  />
                                )}
                                <Input
                                  placeholder="Módulo"
                                  value={aulaEditando.modulo}
                                  onChange={(e) =>
                                    setAulaEditando({ ...aulaEditando, modulo: e.target.value })
                                  }
                                  className="h-9"
                                />
                                {aulaEditando.tipo === "video" && (
                                  <Input
                                    placeholder="Duração do vídeo (mm:ss)"
                                    aria-label="Duração do vídeo em minutos e segundos"
                                    value={aulaEditando.duracao}
                                    onChange={(e) =>
                                      setAulaEditando({ ...aulaEditando, duracao: e.target.value })
                                    }
                                  />
                                )}
                                {aulaEditando.tipo !== "video" && (
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="Tempo mín. de leitura (min)"
                                    value={aulaEditando.minutos}
                                    onChange={(e) =>
                                      setAulaEditando({ ...aulaEditando, minutos: e.target.value })
                                    }
                                    className="h-9"
                                  />
                                )}
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setAulaEditando(null)}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={salvarAulaEdicao}
                                  disabled={gravando.has("aula") || envio?.alvo === aulaEditando.id}
                                >
                                  Salvar aula
                                </Button>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <div className="space-y-2 rounded-lg border border-dashed p-3">
                      <p className="text-xs font-medium text-slate-600">Nova aula</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Módulo (ex.: B04 · Medidas de controle)"
                          value={novaAula.modulo}
                          onChange={(e) => setNovaAula({ ...novaAula, modulo: e.target.value })}
                          list="modulos-curso"
                          className="h-9"
                        />
                        <datalist id="modulos-curso">
                          {[
                            ...new Set(
                              aulasDoCurso(cursoSel.id)
                                .map((a) => a.modulo)
                                .filter(Boolean)
                            ),
                          ].map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                        <div className="flex rounded-md border overflow-hidden text-sm">
                          {[
                            ["video", "Vídeo"],
                            ["pdf", "PDF"],
                            ["texto", "Texto"],
                          ].map(([v, rot]) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setNovaAula({ ...novaAula, tipo: v, arquivo: null })}
                              className={`flex-1 py-1.5 ${
                                novaAula.tipo === v
                                  ? "bg-slate-900 text-white"
                                  : "bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {rot}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Input
                        placeholder="Título da aula"
                        value={novaAula.titulo}
                        onChange={(e) => setNovaAula({ ...novaAula, titulo: e.target.value })}
                        className="h-9"
                      />
                      {novaAula.tipo !== "video" && (
                        <div className="space-y-2">
                          {novaAula.tipo === "pdf" ? (
                            <label className="h-9 flex items-center gap-2 px-3 rounded-md border border-slate-200 text-sm text-slate-600 cursor-pointer hover:border-slate-400 truncate">
                              <FileText className="w-4 h-4 shrink-0" />
                              <span className="truncate">
                                {novaAula.arquivo
                                  ? novaAula.arquivo.name
                                  : "Anexar PDF da aula (até 100 MB)"}
                              </span>
                              <input
                                type="file"
                                accept={ACCEPT_AULA.pdf}
                                className="hidden"
                                onChange={(e) =>
                                  setNovaAula({ ...novaAula, arquivo: e.target.files?.[0] || null })
                                }
                              />
                            </label>
                          ) : (
                            <Textarea
                              rows={5}
                              placeholder="Texto da aula"
                              value={novaAula.texto}
                              onChange={(e) => setNovaAula({ ...novaAula, texto: e.target.value })}
                            />
                          )}
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              placeholder="Tempo mínimo de leitura (min)"
                              value={novaAula.minutos}
                              onChange={(e) =>
                                setNovaAula({ ...novaAula, minutos: e.target.value })
                              }
                              className="h-9"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              title="Adicionar aula"
                              aria-label="Adicionar aula"
                              onClick={adicionarAula}
                              disabled={!!envio}
                            >
                              {envio?.alvo === "nova" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Plus className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                      {novaAula.tipo === "video" && (
                        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                          <label className="h-9 flex items-center gap-2 px-3 rounded-md border border-slate-200 text-sm text-slate-600 cursor-pointer hover:border-slate-400 truncate">
                            <Video className="w-4 h-4 shrink-0" />
                            <span className="truncate">
                              {novaAula.arquivo
                                ? novaAula.arquivo.name
                                : "Anexar vídeo MP4 ou WebM (até 1 GB)"}
                            </span>
                            <input
                              type="file"
                              accept={ACCEPT_AULA.video}
                              className="hidden"
                              onChange={(e) =>
                                setNovaAula({ ...novaAula, arquivo: e.target.files?.[0] || null })
                              }
                            />
                          </label>
                          <span className="text-center text-xs text-slate-400 sm:text-left">
                            ou
                          </span>
                          <Input
                            placeholder="Link do YouTube (não listado)"
                            value={novaAula.url}
                            onChange={(e) => setNovaAula({ ...novaAula, url: e.target.value })}
                            disabled={!!novaAula.arquivo}
                            className="h-9"
                          />
                          {!novaAula.arquivo && (
                            <Input
                              placeholder="Duração (mm:ss)"
                              aria-label="Duração do vídeo do YouTube"
                              value={novaAula.duracao}
                              onChange={(e) =>
                                setNovaAula({ ...novaAula, duracao: e.target.value })
                              }
                              className="h-9"
                            />
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            title="Adicionar aula"
                            aria-label="Adicionar aula"
                            onClick={adicionarAula}
                            disabled={!!envio}
                            className="w-full sm:w-auto"
                          >
                            {envio?.alvo === "nova" ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                            <span className="sm:hidden">Adicionar aula</span>
                          </Button>
                        </div>
                      )}
                      {envio?.alvo === "nova" && (
                        <EnvioProgressoEad envio={envio} onCancelar={cancelarEnvio} />
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      Aulas abrem em ordem. Vídeo conclui com 90% do tempo assistido (a duração é
                      cadastrada pelo RH); PDF e texto, com o tempo mínimo de leitura. O tempo só
                      conta com a tela do aluno aberta.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => gerarListasPresenca(cursoSel)}
                      className="mt-2"
                    >
                      <Users className="w-4 h-4 mr-1" /> Listas de Presença (PDF — 10h/dia)
                    </Button>

                    {/* Avaliação final */}
                    <div className="border-t pt-3 mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-slate-800">
                          Avaliação final ({questoes.length} questão(ões))
                        </h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setNovaQuestao(
                              novoRascunho({ pergunta: "", opcoes: ["", "", "", ""], correta: 0 })
                            )
                          }
                        >
                          <Plus className="w-4 h-4 mr-1" /> Questão
                        </Button>
                      </div>
                      {questoes.map((q, qi) => (
                        <div key={q.id} className="text-sm bg-slate-50 rounded p-2">
                          <div className="flex items-start gap-2">
                            <span className="flex-1 font-medium">
                              {qi + 1}. {q.pergunta}
                            </span>
                            <button
                              type="button"
                              title="Editar questão"
                              aria-label={`Editar a questão ${qi + 1}`}
                              onClick={() =>
                                setNovaQuestao({
                                  id: q.id,
                                  pergunta: q.pergunta || "",
                                  opcoes:
                                    Array.isArray(q.opcoes) && q.opcoes.length >= 2
                                      ? [...q.opcoes]
                                      : ["", ""],
                                  correta: q.correta ?? 0,
                                  comentario: q.comentario || "",
                                })
                              }
                            >
                              <Pencil className="w-4 h-4 text-slate-400 hover:text-slate-800" />
                            </button>
                            <button
                              type="button"
                              title="Excluir questão"
                              aria-label={`Excluir a questão ${qi + 1}`}
                              onClick={() => excluirQuestao(q)}
                            >
                              <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                            </button>
                          </div>
                          <ul className="mt-1 ml-4 space-y-0.5">
                            {(q.opcoes || []).map((o, i) => (
                              <li
                                key={i}
                                className={
                                  i === q.correta
                                    ? "text-emerald-700 font-medium"
                                    : "text-slate-600"
                                }
                              >
                                {String.fromCharCode(65 + i)}) {o} {i === q.correta ? "✓" : ""}
                              </li>
                            ))}
                          </ul>
                          {q.comentario && (
                            <p className="mt-1 ml-4 text-xs text-slate-500 italic">
                              💬 {q.comentario}
                            </p>
                          )}
                        </div>
                      ))}
                      {novaQuestao && (
                        <div className="border rounded-lg p-3 space-y-2 bg-white">
                          <Input
                            placeholder="Pergunta"
                            value={novaQuestao.pergunta}
                            onChange={(e) =>
                              setNovaQuestao({ ...novaQuestao, pergunta: e.target.value })
                            }
                            className="h-9"
                          />
                          {novaQuestao.opcoes.map((o, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="correta"
                                checked={novaQuestao.correta === i}
                                onChange={() => setNovaQuestao({ ...novaQuestao, correta: i })}
                                title="Marcar como correta"
                                aria-label={`Marcar a opção ${String.fromCharCode(65 + i)} como correta`}
                              />
                              <Input
                                placeholder={`Opção ${String.fromCharCode(65 + i)}`}
                                value={o}
                                onChange={(e) => {
                                  const ops = [...novaQuestao.opcoes];
                                  ops[i] = e.target.value;
                                  setNovaQuestao({ ...novaQuestao, opcoes: ops });
                                }}
                                className="h-8"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Remover opção ${String.fromCharCode(65 + i)}`}
                                disabled={novaQuestao.opcoes.length <= 2}
                                onClick={() =>
                                  setNovaQuestao({
                                    ...novaQuestao,
                                    opcoes: novaQuestao.opcoes.filter((_, indice) => indice !== i),
                                    correta:
                                      novaQuestao.correta === i
                                        ? -1
                                        : novaQuestao.correta > i
                                          ? novaQuestao.correta - 1
                                          : novaQuestao.correta,
                                  })
                                }
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={novaQuestao.opcoes.length >= 6}
                            onClick={() =>
                              setNovaQuestao({
                                ...novaQuestao,
                                opcoes: [...novaQuestao.opcoes, ""],
                              })
                            }
                          >
                            <Plus className="w-4 h-4 mr-1" /> Adicionar alternativa
                          </Button>
                          <Input
                            placeholder="Comentário da resposta (aparece só depois da aprovação)"
                            value={novaQuestao.comentario || ""}
                            onChange={(e) =>
                              setNovaQuestao({ ...novaQuestao, comentario: e.target.value })
                            }
                            className="h-9"
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setNovaQuestao(null)}>
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              onClick={salvarQuestao}
                              disabled={gravando.has("questao")}
                            >
                              Salvar questão
                            </Button>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-slate-400">
                        Com questões cadastradas, o funcionário só conclui o curso após assistir
                        todas as aulas E ser aprovado na avaliação (nota mínima acima).
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {previaAberta && cursoSel.id && (
                <PreviaAlunoCurso
                  curso={cursoSel}
                  aulas={aulasDoCurso(cursoSel.id)}
                  questoes={todasQuestoes.filter((q) => q.curso_id === cursoSel.id)}
                  onFechar={() => setPreviaAberta(false)}
                />
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Sheet: matricular */}
      <Sheet open={showMatricular} onOpenChange={setShowMatricular}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Matricular funcionários</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-xs">Curso</Label>
              <select
                className="mt-0.5 w-full h-9 rounded-md border border-slate-200 px-2 text-sm"
                value={matForm.curso_id}
                onChange={(e) => setMatForm({ ...matForm, curso_id: e.target.value })}
              >
                <option value="">Selecionar...</option>
                {cursos
                  .filter((c) => c.ativo !== false && pendenciasCurso(c).length === 0)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Funcionários</Label>
              <Input
                placeholder="Buscar..."
                value={buscaFunc}
                onChange={(e) => setBuscaFunc(e.target.value)}
                className="mt-0.5 h-9"
              />
              <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
                {funcsFiltrados.map((f) => {
                  const marcado = matForm.funcionario_ids.includes(f.id);
                  return (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 text-sm p-2 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() =>
                          setMatForm((prev) => ({
                            ...prev,
                            funcionario_ids: marcado
                              ? prev.funcionario_ids.filter((x) => x !== f.id)
                              : [...prev.funcionario_ids, f.id],
                          }))
                        }
                      />
                      <span className="flex-1">{f.nome_completo}</span>
                      <span className="text-xs text-slate-400">{f.funcao_nome || ""}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <Button
              onClick={matricular}
              disabled={gravando.has("matricula")}
              className="w-full bg-slate-900 hover:bg-slate-800"
            >
              {gravando.has("matricula") && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Matricular ({matForm.funcionario_ids.length})
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {dialogoConfirmar}
    </div>
  );
}
