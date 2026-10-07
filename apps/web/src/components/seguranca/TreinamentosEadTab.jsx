import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sigo, supabase, resolveStorageUrl } from "@/api/sigoClient";
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
  textoDaValidadeDoCurso,
} from "@/lib/ead-modalidade";
import { normalizarQuestao } from "@/lib/ead-questao";
import { parseDuracao, formatDuracao, lerDuracaoVideo } from "@/lib/ead-duracao";
import {
  formatarHoras,
  modalidadeDoCurso,
  pendenciasParaPublicar,
  requisitosDoCurso,
  tempoObrigatorioSeg,
} from "@/lib/ead-requisitos";
import { cargasDoCursoParaGravar } from "@/lib/ead-pratica";
import { numerarAulas } from "@/lib/portal-curso";
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
  erroDeMatricula,
} from "@/lib/ead-gestao";
import { validarNumerosDoCurso } from "@/lib/ead-curso-numeros";
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
import { logoParaPdf } from "@/lib/pdf-empresa";
import { pessoasDosTreinamentos } from "@/lib/instrutores-config";
import {
  aoEscolherPessoa,
  aoMudarNomeDaPessoa,
  aoTrocarImagemDaAssinatura,
  refDeAssinatura,
  semMarcasDeAssinatura,
} from "@/lib/ead-assinatura";
import { MAX_TUTOR_ATENDIMENTO, MAX_TUTOR_NOME, dadosDoTutorParaGravar } from "@/lib/ead-tutor";
import {
  AVISO_PROJETO_OCUPADO,
  avisoDoPdfAoSalvar,
  camposDoProjeto,
  comProjetoNormalizado,
  dadosDoProjetoParaGravar,
  marcaDoProjeto,
} from "@/lib/ead-projeto";
import { nomeDoArquivoDoProjeto, pdfDoProjetoComoBlob } from "@/lib/ead-projeto-pdf";
import { hojeEmBrasilia } from "@/lib/ead-vencimentos";
import {
  comLeituraFrescaDoPreRequisito,
  cursoExigidoDe,
  preRequisitoFechariaCiclo,
  resumoDosBloqueios,
  separarPorPreRequisito,
} from "@/lib/ead-pre-requisito";
import { refDoUpload } from "@/lib/anexo-ref";
import { avisarNoPortal } from "@/lib/portal-funcionario-acesso";
import { decidirAvisoAoRH } from "@/lib/ead-aviso-matricula";
import { lerEmPaginas } from "@/lib/leitura-em-paginas";
import { avisoDoDossie, textoDoAndamento } from "@/lib/ead-dossie";
import { exportarDossieDoCurso } from "@/components/seguranca/exportarDossieEad";
import { useConfirmar } from "@/components/shared/ConfirmarDialog";
import InputTelefone from "@/components/shared/InputTelefone";
import MatriculaAuditoriaSheet from "@/components/seguranca/MatriculaAuditoriaSheet";
import DuvidasTutorCard from "@/components/seguranca/DuvidasTutorCard";
import AulaLinhaEad from "@/components/seguranca/AulaLinhaEad";
import PreRequisitoCursoCampo from "@/components/seguranca/PreRequisitoCursoCampo";
import AssinaturaCursoCampo from "@/components/seguranca/AssinaturaCursoCampo";
import ProjetoPedagogicoCurso from "@/components/seguranca/ProjetoPedagogicoCurso";
import EnvioProgressoEad from "@/components/seguranca/EnvioProgressoEad";
import PreviaAlunoCurso from "@/components/seguranca/PreviaAlunoCurso";
import SessoesPraticasCurso from "@/components/seguranca/SessoesPraticasCurso";
import VencimentosEadPainel from "@/components/seguranca/VencimentosEadPainel";
import MatriculasEadCard from "@/components/seguranca/MatriculasEadCard";
import AmbienteHorarioEadCard from "@/components/seguranca/AmbienteHorarioEadCard";
import MatricularEadSheet from "@/components/seguranca/MatricularEadSheet";
import AvisoAcessoDialog from "@/components/seguranca/AvisoAcessoDialog";
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
  Video,
  Pencil,
  FileText,
  ChevronDown,
  Eye,
  Info,
  Download,
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
// matrículas por INSERT: uma matrícula por função pode passar de uma centena de linhas
const LOTE_DE_MATRICULAS = 200;
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

export default function TreinamentosEadTab({
  empresaAtiva,
  user,
  sugestaoMatricula = null,
  onSugestaoConsumida,
  onDuvidasPendentes,
}) {
  const [cursos, setCursos] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [matriculas, setMatriculas] = useState([]);
  const [certificados, setCertificados] = useState([]);
  // só os funcionários ATIVOS (matrícula, lista de presença, painel de vencimentos) e todos, inclusive
  // ex-funcionários e excluídos (só para dar nome às matrículas antigas: "Fulano (inativo)")
  const [funcionarios, setFuncionarios] = useState([]);
  const [funcionariosTodos, setFuncionariosTodos] = useState([]);
  // andamento das matrículas (aulas feitas, tentativas): vem à parte, sem derrubar a tela se falhar
  const [progresso, setProgresso] = useState([]);
  const [tentativas, setTentativas] = useState([]);
  const [andamento, setAndamento] = useState({ carregado: false, erro: false, parcial: false });
  const [carregando, setCarregando] = useState(true);
  const [cursoSel, setCursoSel] = useState(null); // Sheet de edição do curso
  // o curso que está no painel AGORA: uma gravação lenta (vídeo de até 1 GB) termina com o `cursoSel` do
  // clique e confere nesta referência se o RH ainda está no mesmo curso (A2)
  const cursoSelRef = useRef(null);
  cursoSelRef.current = cursoSel;
  const [previaAberta, setPreviaAberta] = useState(false); // "Ver como aluno" (T28)
  // Dossiê de fiscalização (T34): { cursoId, texto } enquanto o ZIP é montado (um por vez; o ref vale já no
  // 2º clique, antes de a tela redesenhar) e o id da empresa que está na tela, para não baixar o dossiê
  // de uma empresa que já foi trocada.
  const [exportandoDossie, setExportandoDossie] = useState(null);
  const exportandoDossieRef = useRef(false);
  const empresaIdDaTelaRef = useRef(null);
  empresaIdDaTelaRef.current = empresaAtiva?.id;
  const [matriculaDetalheId, setMatriculaDetalheId] = useState(null);
  // painel "Matricular funcionários": null = fechado; senão, como abre ({ modo, cursoId, funcionarioIds,
  // funcaoId, chave }). A senha provisória de um acesso recém-criado fica em `avisoAcesso`, só até o RH
  // fechar a janela.
  const [painelMatricula, setPainelMatricula] = useState(null);
  const [avisoAcesso, setAvisoAcesso] = useState(null);
  const [novaAula, setNovaAula] = useState(NOVA_AULA);
  const [subindoProjeto, setSubindoProjeto] = useState(false);
  // "Gerar PDF do projeto" (T25) em andamento; o ref vale já no 2º clique, antes de a tela redesenhar
  const [gerandoProjeto, setGerandoProjeto] = useState(false);
  const gerandoProjetoRef = useRef(false);
  // anexar o PDF próprio em andamento: o ref vale já no 2º clique e para o Salvar curso (A6, T25)
  const subindoProjetoRef = useRef(false);
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

  // Aulas feitas e tentativas da prova de todas as matrículas da empresa (as colunas de progresso, nota e
  // tentativas da tabela). Essas tabelas não têm `deleted_at` (só inclusão), então a consulta não filtra
  // por ele, e trazem só as colunas que a tabela usa: a tentativa guarda a prova inteira em `jsonb`. Falhar
  // aqui não derruba a tela: as colunas mostram "—" e a tabela avisa. Segue a mesma regra de carga
  // superada de `recarregar`.
  const carregarAndamento = async (carga) => {
    try {
      const filtroEmpresa = carga.empresaId;
      const [prog, tent] = await Promise.all([
        lerEmPaginas(() =>
          supabase
            .from("treinamento_progresso")
            .select("matricula_id, aula_id, concluida")
            .eq("empresa_id", filtroEmpresa)
            .order("id", { ascending: true })
        ),
        lerEmPaginas(() =>
          supabase
            .from("treinamento_tentativa")
            .select("matricula_id, numero, nota, aprovada")
            .eq("empresa_id", filtroEmpresa)
            .order("id", { ascending: true })
        ),
      ]);
      if (!cargas.vale(carga)) return;
      setProgresso(prog.linhas);
      setTentativas(tent.linhas);
      setAndamento({ carregado: true, erro: false, parcial: prog.truncado || tent.truncado });
    } catch (e) {
      if (!cargas.vale(carga)) return;
      console.error("Erro ao carregar o andamento das matrículas:", e);
      setProgresso([]);
      setTentativas([]);
      setAndamento({ carregado: true, erro: true, parcial: false });
    }
  };

  const recarregar = async () => {
    const carga = cargas.iniciar();
    if (!carga) return;
    const filtro = { empresa_id: carga.empresaId };
    // O andamento (aulas feitas e tentativas) não depende da leitura principal: pede-se já, em paralelo. Antes
    // só era pedido no fim do `try`: se esta carga falhasse depois de a anterior ter o andamento descartado
    // (outra carga começou), o andamento desta nunca era pedido e a tabela ficava em "..." (A6).
    carregarAndamento(carga);
    try {
      const [cs, as, ms, fs, certs, tcfg, qs] = await Promise.all([
        sigo.entities.TreinamentoCurso.filter(filtro),
        sigo.entities.TreinamentoAula.filter(filtro),
        sigo.entities.TreinamentoMatricula.filter(filtro),
        // todos, com os excluídos: a matrícula de um ex-funcionário precisa do nome dele
        sigo.entities.Funcionario.filter(filtro, SEM_SOFT_DELETE),
        sigo.entities.TreinamentoCertificado.filter(filtro, SEM_SOFT_DELETE),
        sigo.entities.Treinamento.filter(filtro),
        sigo.entities.TreinamentoQuestao.filter(filtro),
      ]);
      if (!cargas.vale(carga)) return;
      setCursos(cs);
      setAulas(porOrdem(as));
      setMatriculas(ms);
      setFuncionariosTodos(fs);
      setFuncionarios(fs.filter((f) => f.ativo === true && !f.deleted_at));
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
    setPainelMatricula(null);
    setAvisoAcesso(null);
    setProgresso([]);
    setTentativas([]);
    setAndamento({ carregado: false, erro: false, parcial: false });
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

  // Admissão ou troca de função (NR-1, 1.4.4 e 1.7.1.2.1): a página de RH abre esta aba com a sugestão e o
  // painel de matrícula abre já na função do funcionário, com ele marcado. A sugestão é consumida uma vez.
  const aoConsumirSugestaoRef = useRef(onSugestaoConsumida);
  aoConsumirSugestaoRef.current = onSugestaoConsumida;
  useEffect(() => {
    if (!sugestaoMatricula || carregando) return;
    setPainelMatricula({
      modo: "funcao",
      funcaoId: sugestaoMatricula.funcaoId,
      funcionarioIds: [sugestaoMatricula.funcionarioId],
      chave: Date.now(),
    });
    aoConsumirSugestaoRef.current?.();
  }, [sugestaoMatricula, carregando]);

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
  // A lista de requisitos do FORMULÁRIO lê o projeto como seria gravado (A6, T25): o formulário cru podia dizer
  // "PDF desatualizado" logo depois de gerar o PDF (a revisão sugerida de 2 anos só existe no que vai ao banco),
  // enquanto a seção, que já normaliza, dizia "em dia".
  const requisitosDoFormulario = (curso) =>
    requisitos(
      comProjetoNormalizado(curso, {
        aulas: aulasDoCurso(curso.id),
        questoes: todasQuestoes.filter((q) => q.curso_id === curso.id),
      })
    );
  // o que impede PUBLICAR e MATRICULAR (D3: o curso de apoio publica e matricula; só não emite)
  const pendenciasCurso = (curso) => pendenciasParaPublicar(requisitos(curso));
  const funcPorId = useMemo(() => new Map(funcionarios.map((f) => [f.id, f])), [funcionarios]);
  // com os ex-funcionários: a tabela e os detalhes da matrícula mostram o nome de quem já saiu
  const funcTodosPorId = useMemo(
    () => new Map(funcionariosTodos.map((f) => [f.id, f])),
    [funcionariosTodos]
  );
  // null = o curso aceita matrícula (publicado e sem requisito pendente; o de apoio aceita, D3); senão o
  // motivo. É a conta de `pendenciasCurso`, estável entre renders para o painel de matrícula por função.
  const cursoMatriculavel = useCallback(
    (curso) => {
      if (!curso) return "Curso não encontrado";
      if (curso.ativo === false) return "Curso em rascunho (não publicado)";
      const pendencias = pendenciasParaPublicar(
        requisitosDoCurso({
          curso,
          aulas: aulas.filter((a) => a.curso_id === curso.id),
          questoes: todasQuestoes.filter((q) => q.curso_id === curso.id),
        })
      );
      return pendencias.length ? "Curso com pendências para publicar" : null;
    },
    [aulas, todasQuestoes]
  );
  // um certificado por matrícula, consultado por linha da tabela sem varrer a lista a cada vez
  const certPorMatricula = useMemo(() => certificadosPorMatricula(certificados), [certificados]);
  const pessoas = useMemo(
    () => pessoasDosTreinamentos(treinamentosConfig, empresaAtiva?.id),
    [treinamentosConfig, empresaAtiva?.id]
  );
  // O curso como está GRAVADO (A6, T12): a seção das sessões práticas segue a modalidade do banco, não a do
  // formulário. Trocar o seletor para Semipresencial sem salvar abria a seção e deixava criar sessão num curso
  // que no banco é EAD (e o contrário escondia as sessões de um curso semipresencial).
  const cursoGravadoDoFormulario = cursoSel?.id
    ? (cursos.find((c) => c.id === cursoSel.id) ?? null)
    : null;
  // Troca a imagem da assinatura (T29) só no formulário que a pediu E para a pessoa que estava no campo: o
  // envio é lento e o RH pode ter aberto outro curso, mudado o nome ou escolhido outra pessoa enquanto ele
  // terminava (a regra e os avisos estão em lib/ead-assinatura.js, `aoTrocarImagemDaAssinatura`). Lê o
  // formulário de AGORA pela ref e devolve o resultado, para o campo avisar se a imagem não entrou.
  const trocarAssinatura = (pessoa) => {
    const formulario = cursoSel;
    return (ref) => {
      const resultado = aoTrocarImagemDaAssinatura({
        atual: cursoSelRef.current,
        formulario,
        pessoa,
        ref,
      });
      if (resultado.aplicada) setCursoSel(resultado.curso);
      return resultado;
    };
  };
  // O RH escreve o nome do RT ou do instrutor (campo livre, ou "— escolher dos salvos —" que o esvazia): a
  // imagem é de uma pessoa, então a de quem estava antes sai do curso e o RH é avisado (T29). A regra e o
  // texto estão em lib/ead-assinatura.js. O toast fica aqui, no evento, e não dentro do setState.
  const mudarNomeDaPessoa = (pessoa, valor) => {
    const mudanca = aoMudarNomeDaPessoa(cursoSel, pessoa, valor);
    setCursoSel(mudanca.curso);
    if (mudanca.aviso) toast.warning(mudanca.aviso, { duration: 8000 });
  };
  // O RH escolheu alguém da lista de Configurações: nome, registro e a imagem da pessoa entram juntos, e uma
  // imagem que a tela mostrava e sai (a pessoa não tem imagem lá) é avisada, como em `mudarNomeDaPessoa`.
  const escolherPessoa = (pessoa, escolhida) => {
    const mudanca = aoEscolherPessoa(cursoSel, pessoa, escolhida);
    setCursoSel(mudanca.curso);
    if (mudanca.aviso) toast.warning(mudanca.aviso, { duration: 8000 });
  };

  // ------------------------------------------------------------------ cursos
  const salvarCurso = async () => {
    // o PDF do projeto está sendo gerado ou anexado: ele grava o projeto e o ref, e um Salvar no meio podia ser
    // desfeito pela gravação dele (A6, T25)
    if (gerandoProjetoRef.current || subindoProjetoRef.current) {
      toast.error(AVISO_PROJETO_OCUPADO);
      return;
    }
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
    // nota de 0 a 100, carga e validade sem sentido: a mensagem sai daqui, em português, e não do Postgres (A6)
    const numeros = validarNumerosDoCurso(cursoSel);
    if (!numeros.ok) {
      toast.error(numeros.erro);
      return;
    }
    // pré-requisito (T23): o curso escolhido não pode exigir este de volta (o banco também recusa)
    if (preRequisitoFechariaCiclo(cursoSel.id, cursoSel.pre_requisito_curso_id, cursos)) {
      toast.error("Este pré-requisito fecharia um círculo: o curso escolhido já exige este curso");
      return;
    }
    // tutor (T21, D4): nome, WhatsApp e atendimento são opcionais; o telefone só grava se o envio o aceita
    const tutor = dadosDoTutorParaGravar(cursoSel);
    if (!tutor.ok) {
      toast.error(tutor.erro);
      return;
    }
    // projeto pedagógico (T25, Anexo II 3.1 e 3.3): os 12 campos novos do curso; o texto é do RT, a tela só
    // estrutura. A validação só se grava com os 15 itens preenchidos.
    const projeto = dadosDoProjetoParaGravar(cursoSel, {
      aulas: aulasDoCurso(cursoSel.id),
      questoes: todasQuestoes.filter((q) => q.curso_id === cursoSel.id),
    });
    if (!projeto.ok) {
      toast.error(projeto.erro);
      return;
    }
    const dados = {
      empresa_id: empresaAtiva.id,
      modelo_treinamento_id: cursoSel.modelo_treinamento_id || null,
      modalidade: cursoSel.modalidade || "ead",
      pre_requisito_curso_id: cursoSel.pre_requisito_curso_id || null,
      nome: cursoSel.nome.trim(),
      codigo: cursoSel.codigo || null,
      descricao: cursoSel.descricao || null,
      validade_meses: cursoSel.validade_meses ? Number(cursoSel.validade_meses) : null,
      carga_horaria_horas: cursoSel.carga_horaria_horas
        ? Number(cursoSel.carga_horaria_horas)
        : null,
      // semipresencial (T12): carga teórica (EAD) e prática (presencial), só do curso EAD (o cadastro central
      // não as sobrescreve); nos outros cursos ficam vazias
      ...cargasDoCursoParaGravar(cursoSel, gravado),
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
      ...tutor.dados,
      ...projeto.dados,
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
      // o curso como estava no banco ANTES deste salvar: a lista da tela só se atualiza depois da gravação, e um "Gerar
      // PDF" feito segundos antes ainda não aparece nela (A6, T25)
      const antes = cursoSel.id ? await lerCursoAgora(cursoSel.id, gravado) : gravado;
      // Gravado, a imagem da assinatura passa a ser de quem assina (A6): as marcas "imagem sem dono" da tela
      // saem do formulário, e mudar o nome dali em diante retira a imagem (lib/ead-assinatura.js).
      if (cursoSel.id) {
        await sigo.entities.TreinamentoCurso.update(cursoSel.id, dados);
        setCursoSel((atual) =>
          mesmoFormulario(atual, cursoSel) ? semMarcasDeAssinatura(atual) : atual
        );
      } else {
        const novo = await sigo.entities.TreinamentoCurso.create(dados);
        // O id do curso novo só vai para o formulário que foi gravado. Painel fechado durante a
        // gravação: não reabre um curso em branco. Painel reaberto com OUTRO curso: o id não pode ir
        // para ele, senão o próximo "Salvar curso" gravaria os dados de outro curso por cima do novo.
        setCursoSel((atual) =>
          mesmoFormulario(atual, cursoSel)
            ? { ...semMarcasDeAssinatura(atual), id: novo.id }
            : atual
        );
      }
      toast.success("Curso salvo");
      // o projeto mudou e o curso já tem PDF: o que o aluno e a fiscalização abrem ficou antigo (T25)
      const avisoPdf = avisoDoPdfAoSalvar(antes, projeto.dados);
      if (avisoPdf) toast.warning(avisoPdf, { duration: 10000 });
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

  // ZIP de fiscalização do curso (NR-1, 1.6.5, 1.7.4 e Anexo II): projeto pedagógico, matrículas, trilha,
  // tentativas com respostas e certificados. Lê o banco com a sessão do RH, não grava nada.
  const exportarDossie = async (curso) => {
    if (exportandoDossieRef.current) return;
    exportandoDossieRef.current = true;
    const empresaId = empresaAtiva?.id;
    const mostrar = (passo) =>
      setExportandoDossie({ cursoId: curso.id, texto: textoDoAndamento(passo) });
    mostrar({ etapa: "lendo" });
    try {
      const resumo = await exportarDossieDoCurso({
        empresa: empresaAtiva,
        cursoId: curso.id,
        geradoPor: user?.full_name || user?.email || "",
        aoProgredir: mostrar,
        aindaVale: () => empresaIdDaTelaRef.current === empresaId,
      });
      if (!resumo) return; // a empresa foi trocada no meio: nada foi baixado
      const aviso = avisoDoDossie(resumo);
      toast[aviso.tipo](aviso.texto, aviso.tipo === "warning" ? { duration: 20000 } : undefined);
    } catch (e) {
      console.error("[dossie] falha ao exportar:", e);
      toast.error(`Não foi possível exportar o dossiê: ${e?.message || e}`);
    } finally {
      exportandoDossieRef.current = false;
      setExportandoDossie(null);
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

  // O curso como está no banco AGORA. A lista da tela só se atualiza depois da gravação: um
  // "Salvar curso" ou um "Gerar PDF" feito segundos antes ainda não aparece nela (A6, T25). Falhou a leitura: vale a
  // da tela, e o erro fica no console.
  const lerCursoAgora = async (id, reserva) => {
    try {
      return (await sigo.entities.TreinamentoCurso.get(id)) ?? reserva;
    } catch (e) {
      console.error("[projeto-pedagogico] curso não relido, vale o da tela:", e);
      return reserva;
    }
  };

  const enviarProjetoPedagogico = async (arquivo) => {
    if (!arquivo || !cursoSel?.id) return;
    if (
      gerandoProjetoRef.current ||
      subindoProjetoRef.current ||
      gravandoRef.current.has("curso")
    ) {
      toast.error(AVISO_PROJETO_OCUPADO);
      return;
    }
    subindoProjetoRef.current = true;
    setSubindoProjeto(true);
    try {
      const res = await sigo.integrations.Core.UploadFile({
        file: arquivo,
        bucket: "treinamentos",
      });
      const ref = refDoUpload(res);
      if (!ref) throw new Error("o envio do arquivo não devolveu a referência");
      // O PDF próprio é o do projeto que está SALVO no curso: a marca dos campos de hoje vai junto, e o requisito
      // do projeto só fica em ordem enquanto o projeto não mudar depois dele (sem a marca, ficaria desatualizado).
      // O projeto salvo vem do banco: um "Salvar curso" feito segundos antes ainda não chegou na lista da tela.
      const gravado = await lerCursoAgora(
        cursoSel.id,
        cursos.find((c) => c.id === cursoSel.id)
      );
      const projeto_pdf_marca = gravado ? marcaDoProjeto(gravado) : null;
      await sigo.entities.TreinamentoCurso.update(cursoSel.id, {
        projeto_pedagogico_ref: ref,
        projeto_pdf_marca,
      });
      // só no curso que recebeu o PDF: se outro foi aberto durante o envio, ele não é trocado
      setCursoSel((atual) =>
        mesmoFormulario(atual, cursoSel)
          ? { ...atual, projeto_pedagogico_ref: ref, projeto_pdf_marca }
          : atual
      );
      toast.success("Projeto pedagógico anexado — o aluno vê no portal");
      recarregar();
    } catch (e) {
      toast.error("Erro ao anexar: " + (e?.message || e));
    } finally {
      subindoProjetoRef.current = false;
      setSubindoProjeto(false);
    }
  };

  // "Gerar PDF do projeto" (T25): grava os campos do projeto escritos na tela e o PDF com os 15 itens, e põe a
  // referência em `projeto_pedagogico_ref` (o aluno abre pelo portal). O PDF usa os dados JÁ SALVOS do curso
  // (nome, carga, RT, instrutor) com o projeto da tela, para o arquivo e o banco dizerem a mesma coisa.
  const gerarProjetoPedagogicoPdf = async () => {
    const formulario = cursoSel;
    if (!formulario?.id || gerandoProjetoRef.current) return;
    // Salvar curso ou o anexo do PDF próprio em andamento: este Gerar gravaria por cima do que eles gravam (A6, T25)
    if (subindoProjetoRef.current || gravandoRef.current.has("curso")) {
      toast.error(AVISO_PROJETO_OCUPADO);
      return;
    }
    const gravadoNaTela = cursos.find((c) => c.id === formulario.id);
    if (!gravadoNaTela) {
      toast.error("Salve o curso antes de gerar o PDF do projeto");
      return;
    }
    gerandoProjetoRef.current = true;
    setGerandoProjeto(true);
    const empresaId = empresaAtiva?.id;
    try {
      // o curso como está no banco AGORA: a lista da tela só se atualiza depois da gravação, e um "Salvar curso" feito
      // segundos antes (nome, carga, responsável técnico) ainda não aparece nela (A6, T25)
      const gravado = await lerCursoAgora(formulario.id, gravadoNaTela);
      const aulasDoProjeto = aulasDoCurso(formulario.id);
      const questoesDoProjeto = todasQuestoes.filter((q) => q.curso_id === formulario.id);
      // a conferência (e a validação, que exige os 15 itens) vale para o que vai no PDF: os dados salvos do curso
      // com o projeto escrito na tela
      const projeto = dadosDoProjetoParaGravar(
        { ...gravado, ...camposDoProjeto(formulario) },
        { aulas: aulasDoProjeto, questoes: questoesDoProjeto }
      );
      if (!projeto.ok) {
        toast.error(projeto.erro);
        return;
      }
      const logo = await logoParaPdf(empresaAtiva);
      const blob = await pdfDoProjetoComoBlob(
        {
          curso: { ...gravado, ...projeto.dados },
          aulas: aulasDoProjeto,
          questoes: questoesDoProjeto,
          empresa: empresaAtiva,
          geradoEm: hojeEmBrasilia(),
        },
        { logo }
      );
      const arquivo = new File([blob], nomeDoArquivoDoProjeto(gravado), {
        type: "application/pdf",
      });
      const res = await sigo.integrations.Core.UploadFile({
        file: arquivo,
        bucket: "treinamentos",
      });
      const ref = refDoUpload(res);
      if (!ref) throw new Error("o envio do arquivo não devolveu a referência");
      // a marca dos campos que foram para o PDF vai junto: o requisito do projeto só vale enquanto ela bater
      const projeto_pdf_marca = marcaDoProjeto(projeto.dados);
      await sigo.entities.TreinamentoCurso.update(formulario.id, {
        ...projeto.dados,
        projeto_pedagogico_ref: ref,
        projeto_pdf_marca,
      });
      // só no curso que gerou o PDF, e só se a empresa ainda é a mesma (a geração pode demorar)
      if (empresaIdDaTelaRef.current === empresaId) {
        setCursoSel((atual) =>
          mesmoFormulario(atual, formulario)
            ? { ...atual, projeto_pedagogico_ref: ref, projeto_pdf_marca }
            : atual
        );
        toast.success("PDF do projeto gerado e salvo: o aluno abre pelo portal");
        recarregar();
      }
    } catch (e) {
      console.error("[projeto-pedagogico] falha ao gerar o PDF:", e);
      toast.error("Não foi possível gerar o PDF do projeto: " + (e?.message || e));
    } finally {
      gerandoProjetoRef.current = false;
      setGerandoProjeto(false);
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
  // Abre o painel de matrícula (por funcionário ou por função); `inicial` traz o que já vem escolhido.
  const abrirPainelMatricula = (inicial = {}) =>
    setPainelMatricula({ modo: "funcionario", ...inicial, chave: Date.now() });

  // Cria as matrículas que o painel montou (por funcionário ou por função; a conta é de lib/ead-matriculas
  // e lib/ead-matricula-funcao). Cada curso é conferido de novo (pode ter sido despublicado depois de o
  // painel abrir). As linhas vão em lotes de 200; se um lote falhar, o painel segue aberto com a
  // seleção e a lista é recarregada, para a nova tentativa partir do que de fato ficou no banco. Devolve
  // true quando gravou (o painel então fecha).
  const criarMatriculas = async ({ novas, ignorados, bloqueados = 0 }) => {
    if (novas.length === 0) {
      toast.info("Nada a matricular: todos já estão matriculados ou com o treinamento em dia");
      return false;
    }
    const bloqueado = [...new Set(novas.map((n) => n.curso_id))].some((id) =>
      cursoMatriculavel(cursos.find((c) => c.id === id))
    );
    if (bloqueado) {
      toast.error("Este curso ainda tem requisitos pendentes para novas matrículas");
      return false;
    }
    // Pré-requisito (T23): o painel já separou quem não o cumpre; aqui confere de novo com os dados da tela
    // (outras telas chamam esta função) e só grava as liberadas. O servidor ainda recusa emitir sem ele.
    const { liberadas, bloqueadas } = separarPorPreRequisito({
      novas,
      cursos,
      matriculas,
      certificados,
      hoje: hojeEmBrasilia(),
    });
    if (liberadas.length === 0) {
      const grupos = resumoDosBloqueios(bloqueadas, (id) => funcTodosPorId.get(id)?.nome_completo);
      toast.error(
        "Ninguém da seleção tem o pré-requisito do curso: " + grupos.map((g) => g.titulo).join("; ")
      );
      return false;
    }
    const semPreRequisito = bloqueados + bloqueadas.length;
    const empresaId = empresaAtiva.id;
    return gravar(
      "matricula",
      "Erro ao matricular (a lista foi atualizada; confira antes de tentar de novo)",
      async () => {
        try {
          for (let i = 0; i < liberadas.length; i += LOTE_DE_MATRICULAS) {
            await sigo.entities.TreinamentoMatricula.bulkCreate(
              liberadas.slice(i, i + LOTE_DE_MATRICULAS)
            );
          }
        } catch (e) {
          // matrícula aberta repetida (23505): mensagem clara, não o texto cru do Postgres (A6)
          throw erroDeMatricula(e);
        } finally {
          recarregar();
        }
        toast.success(
          `${liberadas.length} matrícula(s) criada(s)` +
            (ignorados ? " (já matriculados ignorados)" : "") +
            (semPreRequisito
              ? `; ${semPreRequisito} sem o pré-requisito do curso não foram matriculados`
              : "")
        );
        // trocou de empresa durante a gravação: o painel já é o da empresa nova
        if (cargas.mesmaEmpresa(empresaId)) setPainelMatricula(null);
      }
    );
  };

  // Avisa o funcionário (WhatsApp) com o link do portal; se ele ainda não tem login, o acesso é criado
  // agora e a senha provisória vai junto. A mensagem NÃO vai mais para a área de transferência sozinha
  // (T22): havendo senha nova, ou se nada foi enviado (sem telefone, telefone inválido), abre uma janela
  // que mostra a senha uma vez e deixa o RH copiar a mensagem quando quiser. Ex-funcionário não recebe aviso
  // nem ganha acesso (o botão da tabela já fica desligado; aqui é a segunda trava).
  //
  // Um aviso por funcionário de cada vez (A6): o clique duplo chamaria `criar` duas vezes, e a 2ª resposta
  // ("já tem acesso", sem senha) trocaria a janela da 1ª, perdendo a senha provisória, que só aparece uma
  // vez. A trava é a mesma `gravar` das outras gravações (uma por chave), que também mostra o erro.
  const avisarFuncionario = async (funcionario) => {
    if (!funcionario || funcionario.ativo === false || funcionario.deleted_at) return;
    await gravar(`avisar-${funcionario.id}`, "Erro ao avisar", async () => {
      const r = await avisarNoPortal(
        funcionario,
        "🎓 Você tem treinamentos no Portal do Funcionário."
      );
      const decisao = decidirAvisoAoRH({ via: r.via, credenciais: r.credenciais });
      if (decisao.aviso) toast[decisao.aviso.tipo](decisao.aviso.texto);
      if (decisao.dialogo) {
        setAvisoAcesso({
          nome: funcionario.nome_completo,
          usuario: r.credenciais?.usuario,
          senha: r.credenciais?.senha_provisoria,
          texto: r.texto,
          situacao: decisao.situacao,
          temSenha: decisao.temSenha,
        });
      }
    });
  };

  // Renovar: cria uma matrícula nova (do zero) no mesmo curso. A concluída fica como histórico, com o
  // certificado dela. O banco é consultado de novo antes de gravar: outro RH pode ter matriculado a pessoa
  // enquanto a janela de confirmação estava aberta.
  const renovarMatricula = async (linha) => {
    const nome = linha.funcionario?.nome_completo || "O funcionário";
    const concluidaEm = linha.dataConclusao
      ? `, concluída em ${fmtData(linha.dataConclusao)},`
      : "";
    const confirmado = await confirmar({
      titulo: "Renovar o treinamento?",
      texto:
        `${nome} faz o curso "${linha.cursoNome}" de novo, do zero, numa nova matrícula.\n\n` +
        `A matrícula atual${concluidaEm} e o certificado dela não mudam: ficam como histórico.\n\n` +
        "Depois de renovar, avise o funcionário pelo WhatsApp (ícone verde da nova linha).",
      rotuloConfirmar: "Renovar",
    });
    if (!confirmado) return;
    const empresaId = empresaAtiva.id;
    await gravar(`renovar-${linha.id}`, "Erro ao renovar a matrícula", async () => {
      const atuais = await sigo.entities.TreinamentoMatricula.filter({
        empresa_id: empresaId,
        funcionario_id: linha.funcionarioId,
        curso_id: linha.cursoId,
      });
      // renovar é o treinamento periódico (T23)
      const { novas } = matriculasNovas({
        matriculas: atuais,
        cursoId: linha.cursoId,
        funcionarioIds: [linha.funcionarioId],
        empresaId,
        tipo: "periodico",
      });
      if (novas.length === 0) {
        toast.info("Este funcionário já tem uma matrícula aberta neste curso");
        recarregar();
        return;
      }
      if (cursoMatriculavel(cursos.find((c) => c.id === linha.cursoId))) {
        toast.error("Este curso ainda tem requisitos pendentes para novas matrículas");
        return;
      }
      // pré-requisito (T23): renovar o curso que exige outro pede o outro dentro da validade. O que a tela sabe do
      // curso exigido pode ter minutos (o RH pode ter concluído, revogado ou apagado ali): relê do banco as
      // matrículas e os certificados DESTE funcionário nele antes de conferir (A6). O servidor segue sendo a trava.
      const preId = cursos.find((c) => c.id === linha.cursoId)?.pre_requisito_curso_id;
      let conferir = { matriculas, certificados };
      if (preId) {
        const matriculasFrescas = await sigo.entities.TreinamentoMatricula.filter({
          empresa_id: empresaId,
          funcionario_id: linha.funcionarioId,
          curso_id: preId,
        });
        const certificadosFrescos = matriculasFrescas.length
          ? await sigo.entities.TreinamentoCertificado.filter(
              { empresa_id: empresaId, matricula_id: { $in: matriculasFrescas.map((m) => m.id) } },
              SEM_SOFT_DELETE
            )
          : [];
        conferir = comLeituraFrescaDoPreRequisito({
          matriculas,
          certificados,
          funcionarioId: linha.funcionarioId,
          cursoId: preId,
          matriculasFrescas,
          certificadosFrescos,
        });
      }
      const { liberadas, bloqueadas } = separarPorPreRequisito({
        novas,
        cursos,
        matriculas: conferir.matriculas,
        certificados: conferir.certificados,
        hoje: hojeEmBrasilia(),
      });
      if (liberadas.length === 0) {
        const [grupo] = resumoDosBloqueios(bloqueadas, () => nome);
        toast.error(
          `Não dá para renovar agora. ${grupo?.titulo ?? "Falta o pré-requisito"} (${grupo?.pessoas[0]?.motivo ?? "não cumprido"}).`
        );
        return;
      }
      try {
        await sigo.entities.TreinamentoMatricula.bulkCreate(liberadas);
      } catch (e) {
        throw erroDeMatricula(e);
      } finally {
        recarregar();
      }
      toast.success("Matrícula de renovação criada. Avise o funcionário pelo WhatsApp.");
    });
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
      nomeFuncionario: funcTodosPorId.get(m.funcionario_id)?.nome_completo,
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

  // ------------------------------------------------------------------ UI
  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando treinamentos...
      </div>
    );
  }

  // Painel "Vencimentos" (T24): o botão Matricular abre o painel de matrícula já com o curso e o funcionário.
  // Só cursos que o painel de matrícula aceitaria (publicados e sem requisito pendente) têm o botão.
  const cursoAceitaMatricula = (cursoId) =>
    cursoMatriculavel(cursos.find((c) => c.id === cursoId)) === null;
  const matricularDoPainel = (cursoId, funcionarioId) =>
    abrirPainelMatricula({ cursoId, funcionarioIds: [funcionarioId] });

  return (
    <div className="space-y-6">
      <VencimentosEadPainel
        cursos={cursos}
        matriculas={matriculas}
        certificados={certificados}
        funcionarios={funcionarios}
        treinamentos={treinamentosConfig}
        tentativas={tentativas}
        andamento={andamento}
        podeMatricular={cursoAceitaMatricula}
        onMatricular={matricularDoPainel}
        onAbrirCurso={(cursoId) => setCursoSel(cursos.find((c) => c.id === cursoId) ?? null)}
        onDetalhes={setMatriculaDetalheId}
      />

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
              <div
                key={c.id}
                className="flex flex-col rounded-lg border border-slate-200 bg-white hover:border-slate-400"
              >
                <button
                  type="button"
                  onClick={() => setCursoSel(c)}
                  className="flex-1 p-3 text-left"
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
                    {textoDaValidadeDoCurso(c)}
                  </p>
                  {/* pré-requisito (T23): o curso só matricula e emite para quem concluiu o exigido */}
                  {cursoExigidoDe(c, cursos) && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Exige: {cursoExigidoDe(c, cursos).curso?.nome ?? "(curso excluído)"}
                    </p>
                  )}
                  {c.ativo === false && (
                    <Badge variant="outline" className="mt-2 text-amber-700 border-amber-300">
                      Rascunho · não publicado
                    </Badge>
                  )}
                </button>
                <div className="border-t border-slate-100 px-2 py-1">
                  {/* o texto do botão muda sozinho durante a exportação ("Certificados 3/12..."); o aria-label
                      é fixo, então esta região avisa o andamento a leitores de tela sem tirar o foco (A6) */}
                  <span role="status" aria-live="polite" className="sr-only">
                    {exportandoDossie?.cursoId === c.id
                      ? `Exportando o dossiê do curso ${c.nome}: ${exportandoDossie.texto}`
                      : ""}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-slate-600"
                    disabled={!!exportandoDossie}
                    onClick={() => exportarDossie(c)}
                    aria-label={`Exportar dossiê de fiscalização do curso ${c.nome}`}
                    title="ZIP para a fiscalização: projeto pedagógico, matrículas, trilha de auditoria, tentativas da prova e certificados"
                  >
                    {exportandoDossie?.cursoId === c.id ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-1" />
                    )}
                    {exportandoDossie?.cursoId === c.id
                      ? exportandoDossie.texto
                      : "Exportar dossiê"}
                  </Button>
                </div>
              </div>
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

      {/* Matrículas: busca, filtros, andamento, renovar, CSV e aviso aos atrasados (T22) */}
      <MatriculasEadCard
        key={empresaAtiva?.id}
        empresaId={empresaAtiva?.id}
        matriculas={matriculas}
        cursos={cursos}
        funcionariosTodos={funcionariosTodos}
        aulas={aulas}
        progresso={progresso}
        tentativas={tentativas}
        certificados={certificados}
        andamento={andamento}
        cursoAceitaMatricula={cursoAceitaMatricula}
        onMatricular={() => abrirPainelMatricula()}
        onDetalhes={setMatriculaDetalheId}
        onAvisar={avisarFuncionario}
        onRemover={removerMatricula}
        onRenovar={renovarMatricula}
      />

      {/* Ambiente e horário do aluno: texto da declaração (RT) e atividade por aluno e dia (T35) */}
      <AmbienteHorarioEadCard
        key={empresaAtiva?.id}
        empresaId={empresaAtiva?.id}
        funcionariosTodos={funcionariosTodos}
      />

      <DuvidasTutorCard
        empresaAtiva={empresaAtiva}
        cursos={cursos}
        funcPorId={funcPorId}
        funcTodosPorId={funcTodosPorId}
        aulas={aulas}
        user={user}
        onPendentes={onDuvidasPendentes}
      />

      {(() => {
        const m = matriculas.find((x) => x.id === matriculaDetalheId);
        if (!m) return null;
        return (
          <MatriculaAuditoriaSheet
            matricula={m}
            curso={cursos.find((c) => c.id === m.curso_id)}
            funcionario={funcTodosPorId.get(m.funcionario_id)}
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
                  {/* T12: a divisão da carga é só deste curso EAD (o cadastro central não a sobrescreve) */}
                  {modalidadeDoCurso(cursoSel) === "semipresencial" && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <Label htmlFor="curso-carga-teorica" className="text-xs">
                          Carga teórica, EAD no portal (h)
                        </Label>
                        <Input
                          id="curso-carga-teorica"
                          type="number"
                          min={0}
                          step="0.5"
                          value={cursoSel.carga_teorica_horas ?? ""}
                          onChange={(e) =>
                            setCursoSel({ ...cursoSel, carga_teorica_horas: e.target.value })
                          }
                          className="mt-0.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="curso-carga-pratica" className="text-xs">
                          Carga prática, presencial (h)
                        </Label>
                        <Input
                          id="curso-carga-pratica"
                          type="number"
                          min={0}
                          step="0.5"
                          value={cursoSel.carga_pratica_horas ?? ""}
                          onChange={(e) =>
                            setCursoSel({ ...cursoSel, carga_pratica_horas: e.target.value })
                          }
                          className="mt-0.5"
                        />
                      </div>
                      <p className="col-span-2 text-xs text-slate-600">
                        As duas somadas dão a carga horária total (
                        {formatarHoras(cursoSel.carga_horaria_horas)}), que vem do cadastro central.
                        O conteúdo do portal precisa cobrir a carga teórica. Valem só para este
                        curso EAD: as exigências das funções não mudam.
                      </p>
                    </div>
                  )}
                </div>
                <PreRequisitoCursoCampo
                  curso={cursoSel}
                  cursos={cursos}
                  onChange={(id) =>
                    setCursoSel((prev) => ({ ...prev, pre_requisito_curso_id: id }))
                  }
                />
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
                      min={0}
                      step={1}
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
                      min={1}
                      step={1}
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
                      min={0}
                      max={100}
                      step={1}
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
                      onNome={(v) => mudarNomeDaPessoa("responsavel_tecnico", v)}
                      onEscolher={(p) => escolherPessoa("responsavel_tecnico", p)}
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
                    onChange={trocarAssinatura("responsavel_tecnico")}
                  />
                  <div>
                    <SeletorPessoa
                      rotulo="Instrutor"
                      pessoas={pessoas.instrutores}
                      formatar={(p) => p.nome + (p.qualificacao ? ` · ${p.qualificacao}` : "")}
                      nome={cursoSel.instrutor_nome}
                      onNome={(v) => mudarNomeDaPessoa("instrutor", v)}
                      onEscolher={(p) => escolherPessoa("instrutor", p)}
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
                    onChange={trocarAssinatura("instrutor")}
                  />
                  <div>
                    <Label className="text-xs">Nome do tutor</Label>
                    <Input
                      value={cursoSel.tutor_nome || ""}
                      maxLength={MAX_TUTOR_NOME}
                      onChange={(e) => setCursoSel({ ...cursoSel, tutor_nome: e.target.value })}
                      placeholder="Quem responde as dúvidas (o aluno vê)"
                      className="mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      WhatsApp do tutor (recebe as dúvidas dos alunos)
                    </Label>
                    <InputTelefone
                      value={cursoSel.tutor_telefone || ""}
                      onChange={(valor) => setCursoSel({ ...cursoSel, tutor_telefone: valor })}
                      className="mt-0.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">
                      Atendimento do tutor: horário e prazo de resposta (o aluno vê)
                    </Label>
                    <Input
                      value={cursoSel.tutor_atendimento || ""}
                      maxLength={MAX_TUTOR_ATENDIMENTO}
                      onChange={(e) =>
                        setCursoSel({ ...cursoSel, tutor_atendimento: e.target.value })
                      }
                      placeholder="Ex.: dias úteis, das 8h às 17h; resposta em até 1 dia útil"
                      className="mt-0.5"
                    />
                    <p className="text-xs text-slate-500 mt-0.5">
                      O tutor é opcional e não impede publicar o curso. O número só recebe o aviso
                      se for um WhatsApp válido, com DDD.
                    </p>
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
                  <ProjetoPedagogicoCurso
                    curso={cursoSel}
                    aulas={aulasDoCurso(cursoSel.id)}
                    questoes={todasQuestoes.filter((q) => q.curso_id === cursoSel.id)}
                    onMudar={(mudanca) => setCursoSel((prev) => ({ ...prev, ...mudanca }))}
                    podeGerarPdf={!!cursoSel.id}
                    gerandoPdf={gerandoProjeto}
                    subindoPdf={subindoProjeto}
                    salvandoCurso={gravando.has("curso")}
                    onGerarPdf={gerarProjetoPedagogicoPdf}
                    onAnexarPdf={enviarProjetoPedagogico}
                    onVerPdf={() => abrirReferencia(cursoSel.projeto_pedagogico_ref)}
                  />
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
                      {modalidadeDoCurso(cursoSel) === "semipresencial" &&
                        ` (teórica ${formatarHoras(cursoSel.carga_teorica_horas)} + prática ` +
                          `${formatarHoras(cursoSel.carga_pratica_horas)}; o conteúdo cobre a teórica)`}
                    </p>
                    <ul className="text-xs space-y-1">
                      {requisitosDoFormulario(cursoSel)
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
                    disabled={gravando.has("curso") || gerandoProjeto || subindoProjeto}
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
                    {/* T12: a lista de presença é da sessão prática presencial (semipresencial); a folha antiga
                        do EAD (10 h por dia, horário fixo) saiu */}
                    {modalidadeDoCurso(cursoGravadoDoFormulario) === "semipresencial" ? (
                      <SessoesPraticasCurso
                        curso={cursoGravadoDoFormulario}
                        empresaAtiva={empresaAtiva}
                        matriculas={matriculas}
                        funcPorId={funcPorId}
                        funcTodosPorId={funcTodosPorId}
                        onAbrirArquivo={abrirReferencia}
                      />
                    ) : modalidadeDoCurso(cursoSel) === "semipresencial" ? (
                      <p className="text-xs text-amber-700">
                        Salve o curso como semipresencial para registrar as sessões práticas
                        presenciais e a lista de presença.
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        A lista de presença é da sessão prática presencial dos cursos
                        semipresenciais. No EAD, o registro de cada aluno é a trilha de auditoria
                        (Detalhes da matrícula) e o dossiê do curso.
                      </p>
                    )}

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

      {/* Sheet: matricular (por funcionário ou por função) */}
      <MatricularEadSheet
        aberto={!!painelMatricula}
        inicial={painelMatricula}
        cursos={cursos}
        funcionarios={funcionarios}
        treinamentos={treinamentosConfig}
        matriculas={matriculas}
        certificados={certificados}
        empresaId={empresaAtiva?.id}
        cursoMatriculavel={cursoMatriculavel}
        gravando={gravando.has("matricula")}
        onConfirmar={criarMatriculas}
        onFechar={() => setPainelMatricula(null)}
      />

      {/* senha provisória (uma única vez) ou mensagem que não saiu */}
      <AvisoAcessoDialog aviso={avisoAcesso} onFechar={() => setAvisoAcesso(null)} />

      {dialogoConfirmar}
    </div>
  );
}
