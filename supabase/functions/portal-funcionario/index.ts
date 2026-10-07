/**
 * portal-funcionario — Portal do Funcionário (treinamentos EAD + ciências).
 *
 * O funcionário entra com USUÁRIO (CPF) e SENHA pessoal. Desde a T38 a senha é da PESSOA (`portal_credencial`) e
 * vale em todas as empresas em que ela tem cadastro ativo; cada cadastro tem o seu VÍNCULO
 * (`funcionario_portal_acesso`), com a senha provisória que o RH daquela empresa gera (funcionario-acesso) e que
 * vence em 7 dias. Regras puras em `_shared/portal-credencial.ts`; spec em
 * docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md. A sessão é um token HMAC de 12h com a empresa
 * escolhida, amarrado à `sessao_versao` do vínculo (`v`: redefinir, desativar e sair nesta empresa derrubam as
 * sessões desta empresa) e à da credencial (`vc`: senha criada com provisória e troca de senha derrubam todas).
 *
 * Ações sem sessão:
 *   { acao:"login", usuario, senha }  → { token, nome, empresa_nome } (uma empresa liberada), ou
 *     { etapa:"escolher_empresa", token_escolha, empresas:[{ id, nome, logo_url }] } (duas ou mais), ou
 *     { etapa:"senha_provisoria", token_ativacao, empresa:{ nome } } (entrou com a provisória: a MESMA resposta com e
 *     sem senha na credencial). Sempre 4 comparações de senha (`conferirLogin`): o tempo não diz o que existe.
 *   { acao:"escolher_empresa", token_escolha, funcionario_id } → a sessão da empresa escolhida (só vínculo liberado)
 *   { acao:"ativar", token_ativacao, nova_senha } (criar a senha: 403 RESET_NEGADO se a credencial já tem senha e o
 *     vínculo nunca foi confirmado), { senha_atual } (já uso o portal em outra empresa; pode responder
 *     { etapa:"nova_senha_obrigatoria" }) ou { senha_atual, nova_senha } → a sessão da empresa da provisória
 * Ações com sessão ({ token }):
 *   trocar_senha { senha_atual, nova_senha } (vale em todas as empresas)   logout
 *   empresas → as OUTRAS empresas liberadas      trocar_empresa { funcionario_id } → o token da outra (vence junto)
 *   dados (leva `outras_empresas`)              evento { evento, matricula_id?, aula_id?, detalhe? }
 *   progresso { matricula_id, aula_id, segundos_assistidos }  (a duração vem do cadastro da aula)
 *   iniciar_avaliacao { matricula_id }          → sorteia a prova NO SERVIDOR (sem gabarito)
 *   avaliacao { matricula_id, respostas:[{questao_id,resposta}] }  (exige iniciar_avaliacao antes; quem
 *     reprova na ÚLTIMA tentativa avisa o RH no sino via `notificar_gestores`, T24: ver avisos.ts)
 *   certificado { matricula_id, senha }          ciencia { ciencia_id }
 *   declarar_ambiente { matricula_id, versao, local_adequado, horario_reservado, sem_outra_atividade } → T35: na 1ª
 *     abertura do curso em cada dia (Brasília) o aluno confirma a orientação do RT e os três itens (local adequado,
 *     horário reservado, sem outra atividade); o SERVIDOR grava o evento `declaracao_ambiente` (origem servidor) com o
 *     texto inteiro, a versão e a ART que ele viu (ver declaracao-ambiente.ts). Uma por matrícula e dia. `dados`
 *     leva o texto (`declaracao_ambiente`) e, em cada curso, `declaracao_hoje`. Versão desatualizada: 409 TEXTO_MUDOU.
 *   duvida { matricula_id, aula_id?, pergunta }  → { duvida, tutor_avisado } (T21: o aviso vai ao WhatsApp do
 *     tutor do curso, com o link para responder, só se o telefone for aceito; ver tutor.ts)
 *
 * `certificado` só emite para curso EAD ou semipresencial (modalidade do curso, T8): curso de apoio responde 409
 * `CURSO_DE_APOIO`; o semipresencial (T12) só emite com a CARGA da prática cumprida (a soma das sessões em que o
 * aluno esteve "presente" e "satisfatório", já realizadas, chega à carga prática do curso), senão 409
 * `PRATICA_PENDENTE` (antes de pedir a senha; ver pratica.ts), e congela as sessões que valeram em
 * `dados.pratica`, os locais delas em `dados.local.pratica`, as duas cargas em `dados.curso` e o período
 * cobrindo os dias da prática. A validade do semipresencial conta do FIM do treinamento (o maior dia entre a
 * conclusão da teoria e o último dia da prática): o servidor regrava a `proxima_renovacao` da matrícula antes de
 * gravar o certificado, para o certificado não nascer vencido; requisito do curso por
 * cumprir responde 409 `REQUISITOS` (só os que travam a EMISSÃO: `pendenciasParaEmitir`); curso que exige outro
 * (`pre_requisito_curso_id`, T23) só emite com o curso exigido concluído e dentro da validade, senão 409
 * `PRE_REQUISITO` (antes de pedir a senha; ver pre-requisito.ts). O tipo do treinamento da matrícula (inicial,
 * periódico ou eventual, com o motivo do eventual) é congelado em `dados` (ver tipo-treinamento.ts). O curso de apoio
 * continua publicado e aceita matrícula (D3), só não emite e não grava `proxima_renovacao`; o reprovado
 * na prova recebe só "insatisfatório" (D10). O certificado traz o local (`dados.local`) e os dias de Brasília.
 * `dados.ciencias` leva TODAS as pendentes e as 30 confirmadas mais recentes (`listarCienciasDoAluno`); se só
 * essa leitura falha, vai `null` (o portal avisa) e a lista de cursos segue normal.
 * Depois do INSERT o hash é refeito a partir do que o banco devolveu: se não se reproduz, o certificado
 * NÃO é entregue, é anulado (revogado pelo sistema) e a emissão responde 500 `EMISSAO_ANULADA` (T10, M5).
 *
 * Assinaturas (T29, D7: vale a imagem): o curso guarda a referência "assinaturas/<empresa>/..." da imagem do
 * instrutor e do RT; a emissão a CONGELA em `assinatura_ref` dentro de `dados.instrutor` e de
 * `dados.responsavel_tecnico` (entra no hash; ver assinaturas.ts). O aluno nunca recebe a referência: `dados`
 * troca por `tem_assinatura` + `assinatura_url` (URL assinada, só da pasta da empresa) e a ação `certificado`
 * a tira da resposta. Falha ao assinar = PDF sem a imagem; certificado sem imagem sai só com nome e registro.
 *
 * Reconfirmar a senha com a sessão aberta (`certificado` e `trocar_senha` com a senha atual) tem limite de
 * tentativas por PESSOA (a credencial, T38 §5.5; escopo próprio, 5 em 15 min); passou do teto responde 429
 * `LIMITE`. Senha vazia é "incorreta" sem consumir tentativa (T27).
 *
 * `evento` e `progresso` (que o navegador repete sozinho) também têm teto por pessoa, em escopos
 * próprios (`VOLUME_POR_ACAO`, em regras.ts); passou do teto responde 429 `LIMITE`. O evento tem três
 * tetos (abrir_aula, play/pausa e o resto), para o play repetido do vídeo não travar a troca de aula.
 * O `progresso` ainda só grava o sinal (ultimo_sinal_em, na credencial: duas empresas ao mesmo tempo dividem o
 * mesmo relógio) se ninguém o mudou desde que o pedido o leu (trava otimista): quem perde a corrida responde 409
 * `SINAL_CONCORRENTE` e não credita tempo (T31).
 *
 * `dados` não leva as questões (saem sorteadas em iniciar_avaliacao) e só assina URL e manda o texto das
 * aulas LIBERADAS: a aula bloqueada vai na lista, mas sem conteúdo (T16).
 *
 * Trilha de auditoria (NR-1, Anexo II): todo acesso e atividade vira uma linha
 * em treinamento_evento com data/hora DO SERVIDOR, IP e dispositivo. O tempo
 * assistido informado pelo navegador é limitado pelo relógio do servidor
 * (ultimo_sinal_em), então não dá para "declarar" tempo que não passou.
 * A trilha é só de inclusão (0135): treinamento_evento, treinamento_tentativa e
 * treinamento_certificado só recebem INSERT daqui; o banco recusa UPDATE/DELETE. A única exceção é a
 * anulação de uma emissão que não conferiu (revogação do sistema, `dadosDaAnulacaoNaEmissao`).
 * Os eventos que o navegador relata (ação `evento`) levam origem "navegador".
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { signPortalToken, verifyPortalToken } from "../_shared/portal-token.ts";
import { hashPassword, verifyPassword } from "../_shared/passwords.ts";
import {
  ESCOPO_ATIVACAO,
  ESCOPO_ESCOLHA,
  ESCOPO_SESSAO,
  MSG_ATIVACAO_VENCIDA,
  MSG_PEDIR_PROVISORIA,
  MSG_RESET_NEGADO,
  TTL_ATIVACAO_SEG,
  TTL_ESCOLHA_SEG,
  ativacaoValida,
  conferirLogin,
  criarComparador,
  decidirLogin,
  efeitoDaConfirmacao,
  efeitoDaSenhaNova,
  estaBloqueada,
  eventoDoResetRecusado,
  eventosDaAtivacao,
  eventosDaFalhaDeLogin,
  exigeTrocaNaAtivacao,
  falhaDeLogin,
  lerPessoaDoBanco,
  outrasEmpresasLiberadas,
  outrosVinculosLiberados,
  podeCriarSenhaNova,
  provisoriasDoLogin,
  registrarEventoDaCredencial,
  sessaoValida,
  ttlDaTroca,
  vinculoEscolhido,
  COLUNAS_CREDENCIAL,
  COLUNAS_VINCULO,
  type CredencialDoPortal,
  type Eventos,
  type ItemDoVinculo,
} from "../_shared/portal-credencial.ts";
import {
  normalizarUsuario,
  motivoSenhaInvalida,
  inteiroAleatorioSeguro,
  registrarEvento,
  origemDaRequisicao,
  gerarCodigoCertificado,
  hashDoCertificado,
  HASH_VERSAO_CANONICO,
  EVENTO_CERTIFICADO_REVOGADO,
  EVENTO_TENTATIVA_LIBERADA,
  dataBrasilia,
  type EventoPortal,
} from "../_shared/portal-funcionario.ts";
import { enviarWhatsAppTexto } from "../_shared/whatsapp-envio.ts";
import { assinarDaEmpresa, refDaEmpresa } from "../_shared/storage-assinar.ts";
import { carregarDocumentos } from "./documentos.ts";
import { confirmarCiencia, listarCienciasDoAluno } from "./ciencia.ts";
import { destinoDoAvisoAoTutor, mensagemDuvidaAoTutor, tutorParaOAluno } from "./tutor.ts";
import { projetoParaOAluno } from "./projeto.ts";
import {
  EVENTO_DECLARACAO_AMBIENTE,
  declaracaoParaOAluno,
  detalheDaDeclaracao,
  lerDeclaracoesDoDia,
  lerTextoDaDeclaracao,
  validarDeclaracao,
} from "./declaracao-ambiente.ts";
import {
  bloqueioDeEmissaoPorPreRequisito,
  cursosExigidosDoBanco,
  lerPreRequisito,
  preRequisitoDoCurso,
} from "./pre-requisito.ts";
import { dadosDoTipoNoCertificado } from "./tipo-treinamento.ts";
import {
  bloqueioDeEmissaoPorPratica,
  dadosDaPraticaNoCertificado,
  lerPratica,
  localComPratica,
  periodoDoSemipresencial,
  praticaDoCertificado,
  praticaParaOAluno,
  praticasDoBanco,
} from "./pratica.ts";
import { avisarGestores, avisoDeTentativasEsgotadas, esgotouAsTentativas } from "./avisos.ts";
import {
  certificadoParaOAluno,
  dadosParaOAluno,
  instrutorDoCertificado,
  refsDasAssinaturas,
  responsavelTecnicoDoCertificado,
} from "./assinaturas.ts";
import {
  bloqueioDeEmissaoPorModalidade,
  duracaoParaProgresso,
  emiteCertificado,
  modalidadeDoCurso,
  pendenciasParaEmitir,
  requisitosDoCurso,
} from "./requisitos.ts";
import {
  COLUNAS_MATRICULA_PORTAL,
  EVENTO_CONCLUSAO_ADIADA,
  EVENTO_CONCLUSAO_REGISTRADA,
  EVENTO_PROVA_INICIADA,
  LOCAL_DO_CERTIFICADO,
  MSG_EMISSAO_ANULADA,
  MSG_MUITAS_ACOES,
  MSG_SINAL_CONCORRENTE,
  MSG_TRILHA_INDISPONIVEL,
  MOTIVO_EMISSAO_ANULADA,
  NOTA_MINIMA_PADRAO,
  POR_SISTEMA,
  TEMPO_MINIMO_PROVA_POR_QUESTAO_SEG,
  type AcaoComVolume,
  type MotivoDaConclusaoAdiada,
  acaoDeVolumeDoEvento,
  aulaLiberada,
  aulasParaAluno,
  bloqueioDaTrilhaNoCertificado,
  certificadoParaResposta,
  comRastroDeFalha,
  conclusaoDaAula,
  conclusoesAdiadas,
  conferirEmissaoDoCertificado,
  corrigirProva,
  creditarTempo,
  cursoPublicado,
  dadosDaAnulacaoNaEmissao,
  dentroDoVolume,
  detalheDaProvaIniciada,
  detalheLimitado,
  fecharConclusaoAdiada,
  horaDeBrasilia,
  inicioDaProva,
  liberacoesPorMatricula,
  logoAssinadoParaPdf,
  matriculaParaAluno,
  periodoDoCertificado,
  type ProgressoDaAula,
  provaDaOrdem,
  proximaTentativaEm,
  reconfirmarSenha,
  refsDasAulasLiberadas,
  respostaDaCorrecao,
  resultadoDoSinal,
  retomarConclusoes,
  situacaoDasTentativas,
  situacaoDaTrilha,
  sortearProva,
  textoDaModalidade,
  travaDoSinal,
  validarEnvio,
} from "./regras.ts";
import { concluirSeCompleto, situacaoReal, trilhaDoCurso } from "./conclusao.ts";
import { prepararProva, type RecusaDaProva } from "./prova.ts";
import {
  consumirTentativa,
  ipDaRequisicao,
  liberarTentativas,
  MSG_MUITAS_TENTATIVAS,
} from "../_shared/limite-tentativas.ts";

const TTL_SESSAO = 60 * 60 * 12;
const TTL_ARQUIVO = 60 * 60 * 3; // URLs assinadas de vídeo/legenda/PDF
const TEMPO_MINIMO_PADRAO = 60; // aula de PDF/texto sem tempo definido
// limitador atômico do login (mesmos tetos do login-custom)
const JANELA_LOGIN_SEG = 15 * 60;
const MAX_LOGIN_POR_IP = 30;
const MAX_LOGIN_POR_CONTA = 8;
// Antes de a senha conferir, TODA falha de login responde igual (401): a
// resposta não revela se o CPF existe, está bloqueado ou desativado.
const MSG_CREDENCIAIS = "Credenciais inválidas: confira o usuário (CPF) e a senha.";
// cada dúvida manda WhatsApp ao tutor pelo canal único do SaaS
const JANELA_DUVIDA_SEG = 60 * 60;
const MAX_DUVIDAS_POR_HORA = 10;

const EVENTOS_CLIENTE = new Set([
  "abrir_curso",
  "abrir_aula",
  "play",
  "pausa",
  "fim_video",
  "aba_oculta",
  "aba_visivel",
  "avaliacao_inicio",
  "abrir_projeto",
  "abrir_certificado",
]);

// comparação de senha com usuário inexistente gasta o mesmo tempo
const HASH_FICTICIO = await hashPassword(crypto.randomUUID());
// O login e a ativação só aceitam bcrypt; outro formato paga o bcrypt do fictício e não confere (T38, R10)
const compararSenha = criarComparador(
  async (senha, hash) => (await verifyPassword(senha, hash)).ok,
  HASH_FICTICIO
);
const MSG_SEM_LEITURA = "Não foi possível entrar agora. Tente de novo em instantes.";

interface Body {
  acao?: string;
  usuario?: string;
  senha?: string;
  senha_atual?: string;
  nova_senha?: string;
  token?: string;
  // T38: etapas do login sem sessão e a escolha da empresa
  token_escolha?: string;
  token_ativacao?: string;
  funcionario_id?: string;
  evento?: string;
  detalhe?: Record<string, unknown>;
  matricula_id?: string;
  aula_id?: string;
  segundos_assistidos?: number;
  concluir?: boolean;
  respostas?: unknown;
  ciencia_id?: string;
  pergunta?: string;
  // declarar_ambiente (T35)
  versao?: number;
  local_adequado?: boolean;
  horario_reservado?: boolean;
  sem_outra_atividade?: boolean;
}

// deno-lint-ignore no-explicit-any
type Db = any;

/** A recusa da prova (prova.ts) como resposta HTTP. */
const recusaDaProva = (r: RecusaDaProva) => fail(r.mensagem, r.status, r.extra);

/** A aula existe (não apagada) e é do curso, na empresa da sessão. */
async function aulaDoCurso(supabase: Db, aulaId: string, cursoId: string, empresaId: string) {
  const { data } = await supabase
    .from("treinamento_aula")
    .select("id")
    .eq("id", aulaId)
    .eq("curso_id", cursoId)
    .eq("empresa_id", empresaId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

/**
 * As matrículas (entre `matriculaIds`, do funcionário e da empresa da sessão) cuja conclusão está adiada e ainda
 * não foi registrada: lê os eventos `conclusao_adiada` e `conclusao_registrada` e deixa a conta para
 * `conclusoesAdiadas` (regras.ts). Erro de leitura LANÇA: não pode virar "nenhuma pendência" em silêncio, e quem
 * chama (`retomarConclusoes`) registra a causa, não conclui nada e não derruba o `dados`.
 */
async function conclusoesAdiadasDoBanco(
  supabase: Db,
  {
    empresaId,
    funcionarioId,
    matriculaIds,
  }: { empresaId: string; funcionarioId: string; matriculaIds: string[] }
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("treinamento_evento")
    .select("matricula_id, evento, created_at")
    .eq("empresa_id", empresaId)
    .eq("funcionario_id", funcionarioId)
    .in("evento", [EVENTO_CONCLUSAO_ADIADA, EVENTO_CONCLUSAO_REGISTRADA])
    .in("matricula_id", matriculaIds);
  if (error) throw error;
  return conclusoesAdiadas(data ?? []);
}

/**
 * Assina em lote as referências "bucket/caminho" (vídeo, legenda, PDF). Só as
 * da pasta da empresa da sessão (refDaEmpresa): ref gravada apontando para a
 * pasta de outra empresa fica sem URL. Mapa ref original → URL assinada.
 */
async function assinarRefs(
  supabase: Db,
  refs: (string | null | undefined)[],
  empresaId: string,
  ttl = TTL_ARQUIVO
) {
  const porBucket = new Map<string, Map<string, string[]>>(); // bucket → caminho → originais
  for (const original of new Set(refs.filter((r): r is string => !!r))) {
    const ref = refDaEmpresa(original, empresaId);
    if (!ref) continue;
    const i = ref.indexOf("/");
    const bucket = ref.slice(0, i);
    const caminho = ref.slice(i + 1);
    const caminhos = porBucket.get(bucket) ?? new Map<string, string[]>();
    caminhos.set(caminho, [...(caminhos.get(caminho) ?? []), original]);
    porBucket.set(bucket, caminhos);
  }
  const assinada = new Map<string, string>();
  for (const [bucket, caminhos] of porBucket) {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrls([...caminhos.keys()], ttl);
    for (const s of data ?? []) {
      if (!s?.signedUrl || !s.path) continue;
      for (const original of caminhos.get(s.path) ?? []) assinada.set(original, s.signedUrl);
    }
  }
  return assinada;
}

/**
 * Grava os eventos de uma decisão do login (T38, §7): os da trilha de cada empresa (o `login_falha` vai sem IP e
 * dispositivo: `semOrigemNaTrilha`) e os do registro do operador (com os dois). Nunca derruba a ação.
 */
async function gravarEventos(
  supabase: Db,
  req: Request,
  credencialId: string,
  eventos: Eventos,
  opcoes: { semOrigemNaTrilha?: boolean } = {}
) {
  for (const e of eventos.trilha) {
    await registrarEvento(supabase, req, e, { semOrigem: !!opcoes.semOrigemNaTrilha });
  }
  for (const e of eventos.operador) {
    await registrarEventoDaCredencial(supabase, req, { credencial_id: credencialId, ...e });
  }
}

/** Nome e logo das empresas (só as dos vínculos da própria pessoa). Falha de leitura = sem nome. */
async function empresasDoBanco(supabase: Db, ids: string[]) {
  const mapa = new Map<string, { nome: string; logo_url: string | null }>();
  if (!ids.length) return mapa;
  const { data, error } = await supabase
    .from("empresa")
    .select("id, nome, razao_social, logo_url")
    .in("id", [...new Set(ids)]);
  if (error) console.error("[portal-funcionario] nomes das empresas:", error.message);
  for (const e of data ?? []) {
    mapa.set(e.id, { nome: e.nome || e.razao_social || "", logo_url: e.logo_url ?? null });
  }
  return mapa;
}

/**
 * A lista "Em qual empresa você quer entrar?": só vínculos liberados da própria pessoa. `id` é o funcionario_id
 * daquele cadastro (dado dela); o logo vai como URL assinada só da pasta da empresa (falha = sem logo).
 */
async function empresasParaEscolha(supabase: Db, itens: ItemDoVinculo[]) {
  const empresas = await empresasDoBanco(
    supabase,
    itens.map((i) => i.vinculo.empresa_id)
  );
  const lista = await Promise.all(
    itens.map(async (i) => {
      const emp = empresas.get(i.vinculo.empresa_id);
      const logo = await logoAssinadoParaPdf(emp?.logo_url, (refs: string[]) =>
        assinarDaEmpresa(supabase, refs, i.vinculo.empresa_id)
      );
      return { id: i.vinculo.funcionario_id, nome: emp?.nome ?? "", logo_url: logo };
    })
  );
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const supabase = createAdminClient();
    const agoraIso = () => new Date().toISOString();

    // Sessão de uma empresa (T38): token com a credencial (a pessoa), a empresa e o cadastro escolhidos; `v` é a
    // versão do vínculo e `vc`, a da credencial. `ttl` menor só na troca de empresa (vence junto com o de origem).
    const tokenDaSessao = (
      credencialId: string,
      vc: number,
      item: ItemDoVinculo,
      ttl = TTL_SESSAO
    ) =>
      signPortalToken(
        {
          scope: ESCOPO_SESSAO,
          credencial_id: credencialId,
          empresa_id: item.vinculo.empresa_id,
          funcionario_id: item.vinculo.funcionario_id,
          v: item.vinculo.sessao_versao,
          vc,
        },
        ttl
      );
    // A resposta de quem entrou (o nome do cadastro e o da empresa, para o cabeçalho do portal).
    const respostaDaSessao = async (token: string, item: ItemDoVinculo) => {
      const empresa = (await empresasDoBanco(supabase, [item.vinculo.empresa_id])).get(
        item.vinculo.empresa_id
      );
      return ok({
        token,
        nome: item.cadastro?.nome_completo ?? "",
        empresa_nome: empresa?.nome ?? "",
      });
    };
    // Entrou com a senha pessoal (login com uma empresa liberada, escolha da empresa ou troca de empresa): último
    // acesso NESTA empresa e `login` na trilha dela, igual em todos os caminhos (§5.4: a trilha não diz que a pessoa
    // veio de outra empresa).
    const entrarComSenha = async (
      credencial: CredencialDoPortal,
      item: ItemDoVinculo,
      ttl = TTL_SESSAO
    ) => {
      await supabase
        .from("funcionario_portal_acesso")
        .update({ ultimo_acesso: agoraIso() })
        .eq("funcionario_id", item.vinculo.funcionario_id)
        .eq("empresa_id", item.vinculo.empresa_id);
      await registrarEvento(supabase, req, {
        empresa_id: item.vinculo.empresa_id,
        funcionario_id: item.vinculo.funcionario_id,
        evento: "login",
        detalhe: { via: "senha" },
      });
      const token = await tokenDaSessao(credencial.id, credencial.sessao_versao, item, ttl);
      return respostaDaSessao(token, item);
    };
    // Senha errada (no login ou na senha atual da ativação): conta na credencial (bloqueia na 5ª) e grava
    // `login_falha` na trilha dos vínculos liberados, sem IP e dispositivo, e no registro do operador, com os dois.
    const contarFalhaDeSenha = async (
      credencial: CredencialDoPortal,
      itens: ItemDoVinculo[],
      agora: number
    ) => {
      const falha = falhaDeLogin({ credencial, agora });
      await supabase
        .from("portal_credencial")
        .update({ tentativas: falha.tentativas, bloqueado_ate: falha.bloqueado_ate })
        .eq("id", credencial.id);
      await gravarEventos(
        supabase,
        req,
        credencial.id,
        eventosDaFalhaDeLogin({
          credencial,
          itens,
          agora,
          tentativa: falha.tentativa,
          bloqueou: falha.bloqueou,
        }),
        { semOrigemNaTrilha: true }
      );
    };
    // Mesma resposta para CPF inexistente, senha errada e acesso bloqueado ou desativado: 423/403 só depois de a
    // senha conferir (enumeração de CPF).
    const credenciaisInvalidas = () => fail(MSG_CREDENCIAIS, 401, { codigo: "CREDENCIAIS" });
    const bloqueadoAte = (ate: string) =>
      fail(
        `Acesso bloqueado por senhas erradas. Tente de novo às ${horaDeBrasilia(ate)} ou fale com o RH.`,
        423,
        { codigo: "BLOQUEADO" }
      );

    // ---------------------------------------------------------------- login
    if (body.acao === "login") {
      const usuario = normalizarUsuario(body.usuario ?? "");
      const senha = body.senha ?? "";
      if (!usuario || !senha) return fail("Informe usuário e senha", 400);

      // Limite de tentativas por IP e por CPF (padrão do login-custom): consumido
      // ANTES de conferir a senha — rajada paralela não passa do teto (o
      // contador `tentativas` da credencial é lido-e-gravado, não segura concorrência).
      // CPF não cadastrado também conta: o 429 não revela quem existe.
      const limite = await consumirTentativa(supabase, "funcionario-login", JANELA_LOGIN_SEG, [
        { tipo: "ip", valor: ipDaRequisicao(req), max: MAX_LOGIN_POR_IP },
        { tipo: "conta", valor: usuario, max: MAX_LOGIN_POR_CONTA },
      ]);
      if (!limite.permitido) return fail(MSG_MUITAS_TENTATIVAS, 429, { codigo: "LIMITE" });

      // A pessoa e os vínculos dela (cada um com o cadastro), lidos sempre; depois, SEMPRE as 4 comparações (a
      // pessoal e três provisórias), sem sair antes: o tempo não diz se o CPF existe, se tem senha nem quantas
      // provisórias tem (§5.1, passo 0). Só então a decisão.
      const lida = await lerPessoaDoBanco(supabase, { usuario });
      if (!lida.ok) return fail(MSG_SEM_LEITURA, 503);
      const { credencial, itens } = lida;
      const agora = Date.now();
      const conferencia = await conferirLogin({
        senha,
        credencial,
        provisorias: provisoriasDoLogin({ itens, credencial, agora }),
        comparar: compararSenha,
        hashFicticio: HASH_FICTICIO,
      });
      const decisao = decidirLogin({ credencial, conferencia, itens, agora });

      if (decisao.tipo === "credenciais") {
        if (decisao.contarFalha && credencial) await contarFalhaDeSenha(credencial, itens, agora);
        return credenciaisInvalidas();
      }
      // a senha conferiu: agora pode dizer o motivo (sem o nome de nenhuma empresa, R4)
      if (decisao.tipo === "bloqueado") return bloqueadoAte(decisao.ate);
      if (decisao.tipo === "pedir_provisoria") {
        return fail(MSG_PEDIR_PROVISORIA, 403, { codigo: "PEDIR_PROVISORIA" });
      }
      if (decisao.tipo === "cadastro_inativo") return fail("Cadastro inativo — fale com o RH", 403);
      if (decisao.tipo === "desativado") {
        return fail("Acesso desativado — fale com o RH", 403, { codigo: "DESATIVADO" });
      }
      await liberarTentativas(supabase, limite);
      if (!credencial) return credenciaisInvalidas(); // (não acontece: a decisão já exigiu a credencial)

      if (decisao.tipo === "senha_provisoria") {
        // A MESMA resposta com e sem senha na credencial (defesa 2): a tela é a mesma para todos. A empresa é a da
        // provisória, que quem a digitou já conhece. O token de ativação é amarrado à provisória (`pc`).
        const v = decisao.item.vinculo;
        const tokenAtivacao = await signPortalToken(
          {
            scope: ESCOPO_ATIVACAO,
            credencial_id: credencial.id,
            empresa_id: v.empresa_id,
            funcionario_id: v.funcionario_id,
            pc: v.provisoria_criada_em,
          },
          TTL_ATIVACAO_SEG
        );
        const empresa = (await empresasDoBanco(supabase, [v.empresa_id])).get(v.empresa_id);
        return ok({
          etapa: "senha_provisoria",
          token_ativacao: tokenAtivacao,
          empresa: { nome: empresa?.nome ?? "" },
        });
      }

      // senha pessoal certa: o contador de erros da pessoa zera
      await supabase
        .from("portal_credencial")
        .update({ tentativas: 0, bloqueado_ate: null })
        .eq("id", credencial.id);
      if (decisao.tipo === "escolher") {
        const tokenEscolha = await signPortalToken(
          {
            scope: ESCOPO_ESCOLHA,
            empresa_id: "",
            credencial_id: credencial.id,
            vc: credencial.sessao_versao,
          },
          TTL_ESCOLHA_SEG
        );
        return ok({
          etapa: "escolher_empresa",
          token_escolha: tokenEscolha,
          empresas: await empresasParaEscolha(supabase, decisao.itens),
        });
      }
      return entrarComSenha(credencial, decisao.item);
    }

    // ------------------------------------------------------ escolher empresa
    // Depois da senha certa com duas ou mais empresas liberadas: o cadastro escolhido só vale se for de um vínculo
    // LIBERADO da credencial do token (e o token só vale com a mesma versão da credencial).
    if (body.acao === "escolher_empresa") {
      const escolha = body.token_escolha ? await verifyPortalToken(body.token_escolha) : null;
      if (
        !escolha ||
        escolha.scope !== ESCOPO_ESCOLHA ||
        typeof escolha.credencial_id !== "string"
      ) {
        return fail("Entre de novo com o seu usuário e a sua senha", 401, { codigo: "SESSAO" });
      }
      const lida = await lerPessoaDoBanco(supabase, { id: escolha.credencial_id });
      if (!lida.ok) return fail(MSG_SEM_LEITURA, 503);
      const { credencial, itens } = lida;
      if (!credencial || credencial.sessao_versao !== escolha.vc) {
        return fail("Entre de novo com o seu usuário e a sua senha", 401, { codigo: "SESSAO" });
      }
      const item = vinculoEscolhido({
        itens,
        credencial,
        funcionarioId: body.funcionario_id,
        agora: Date.now(),
      });
      if (!item) {
        return fail("Esta empresa não está disponível agora. Entre de novo.", 401, {
          codigo: "SESSAO",
        });
      }
      return entrarComSenha(credencial, item);
    }

    // ---------------------------------------------------------------- ativar
    // Depois de entrar com a senha provisória (§5.1): criar a senha (`nova_senha`), confirmar a que já usa em outra
    // empresa (`senha_atual`) ou confirmar e trocar (`senha_atual` + `nova_senha`, obrigatório quando a senha atual
    // nasceu da provisória de outra empresa). Em todas, o vínculo da provisória fica liberado e confirmado, a
    // provisória é apagada e a resposta é a sessão daquela empresa.
    if (body.acao === "ativar") {
      const ativacao = body.token_ativacao ? await verifyPortalToken(body.token_ativacao) : null;
      if (
        !ativacao ||
        ativacao.scope !== ESCOPO_ATIVACAO ||
        typeof ativacao.credencial_id !== "string"
      ) {
        return fail(MSG_ATIVACAO_VENCIDA, 401, { codigo: "ATIVACAO" });
      }
      const lida = await lerPessoaDoBanco(supabase, { id: ativacao.credencial_id });
      if (!lida.ok) return fail(MSG_SEM_LEITURA, 503);
      const { credencial, itens } = lida;
      const agora = Date.now();
      const item = itens.find((i) => i.vinculo.funcionario_id === ativacao.funcionario_id) ?? null;
      if (
        !credencial ||
        !item ||
        !ativacaoValida({
          payload: ativacao,
          credencial,
          vinculo: item.vinculo,
          cadastro: item.cadastro,
          agora,
        })
      ) {
        return fail(MSG_ATIVACAO_VENCIDA, 401, { codigo: "ATIVACAO" });
      }
      const empresaDaProvisoria = item.vinculo.empresa_id;
      const nova = typeof body.nova_senha === "string" ? body.nova_senha : "";
      const atual = typeof body.senha_atual === "string" ? body.senha_atual : "";
      // o vínculo da provisória fica liberado; só se a provisória ainda é a do token (uma nova anula esta)
      const liberarVinculo = async (efeito: Record<string, unknown>) => {
        const { data, error } = await supabase
          .from("funcionario_portal_acesso")
          .update(efeito)
          .eq("funcionario_id", item.vinculo.funcionario_id)
          .eq("empresa_id", empresaDaProvisoria)
          .eq("provisoria_criada_em", item.vinculo.provisoria_criada_em)
          .select("funcionario_id");
        if (error) console.error("[portal-funcionario] ativar: vínculo:", error.message);
        return !error && (data?.length ?? 0) > 0;
      };
      const vinculoNaoLiberado = () =>
        fail(
          "Sua senha foi salva, mas o acesso desta empresa não foi liberado (a senha provisória mudou). Entre de " +
            "novo com o CPF e a senha provisória mais recente.",
          409,
          { codigo: "ATIVACAO" }
        );

      // ------------------------------------------------ criar a senha (casos 1 e 3)
      if (!atual) {
        if (!nova) return fail("Crie a sua senha pessoal", 400);
        // defesa 1: credencial com senha só cria senha nova pela provisória de um vínculo já confirmado
        if (!podeCriarSenhaNova({ credencial, vinculo: item.vinculo })) {
          await gravarEventos(supabase, req, credencial.id, eventoDoResetRecusado(item));
          return fail(MSG_RESET_NEGADO, 403, { codigo: "RESET_NEGADO" });
        }
        const motivo = motivoSenhaInvalida(nova, credencial.usuario);
        if (motivo) return fail(motivo, 400);
        const efeito = efeitoDaSenhaNova({ credencial, item, itens, agora });
        // trava otimista na geração lida: duas ativações ao mesmo tempo, só a primeira grava
        const { data: gravadas, error } = await supabase
          .from("portal_credencial")
          .update({ ...efeito.credencial, senha_hash: await hashPassword(nova) })
          .eq("id", credencial.id)
          .eq("senha_geracao", credencial.senha_geracao)
          .select("id");
        if (error) return fail("Erro ao salvar a senha", 500);
        if (!gravadas?.length) return fail(MSG_ATIVACAO_VENCIDA, 409, { codigo: "ATIVACAO" });
        if (!(await liberarVinculo(efeito.vinculo))) return vinculoNaoLiberado();
        await gravarEventos(
          supabase,
          req,
          credencial.id,
          eventosDaAtivacao({
            forma: "senha_nova",
            primeira: !credencial.senha_hash,
            item,
            travadas: efeito.travadas,
          })
        );
        const token = await tokenDaSessao(credencial.id, efeito.credencial.sessao_versao, item);
        return respostaDaSessao(token, item);
      }

      // ------------------------------------- já uso o portal em outra empresa (caso 2)
      // A senha atual é tentativa de senha: limitador por IP e pessoa, e o bloqueio da credencial (caso 6). Credencial
      // sem senha paga o mesmo bcrypt (fictício) e responde igual à senha errada.
      const limite = await consumirTentativa(supabase, "funcionario-ativar", JANELA_LOGIN_SEG, [
        { tipo: "ip", valor: ipDaRequisicao(req), max: MAX_LOGIN_POR_IP },
        { tipo: "conta", valor: credencial.id, max: MAX_LOGIN_POR_CONTA },
      ]);
      if (!limite.permitido) return fail(MSG_MUITAS_TENTATIVAS, 429, { codigo: "LIMITE" });
      const confere =
        (await compararSenha(atual, credencial.senha_hash || HASH_FICTICIO)) &&
        !!credencial.senha_hash;
      const bloqueada = estaBloqueada(credencial, agora);
      if (!confere) {
        if (!bloqueada) await contarFalhaDeSenha(credencial, itens, agora);
        return credenciaisInvalidas();
      }
      if (bloqueada) return bloqueadoAte(credencial.bloqueado_ate as string);
      await liberarTentativas(supabase, limite);

      if (!nova) {
        // a senha atual nasceu da provisória de OUTRA empresa: antes de liberar, uma senha nova (P10)
        if (exigeTrocaNaAtivacao({ credencial, empresaId: empresaDaProvisoria })) {
          return ok({ etapa: "nova_senha_obrigatoria" });
        }
        const efeito = efeitoDaConfirmacao({ credencial, item, agora, troca: false });
        await supabase.from("portal_credencial").update(efeito.credencial).eq("id", credencial.id);
        if (!(await liberarVinculo(efeito.vinculo))) {
          return fail(MSG_ATIVACAO_VENCIDA, 409, { codigo: "ATIVACAO" });
        }
        await gravarEventos(
          supabase,
          req,
          credencial.id,
          eventosDaAtivacao({ forma: "senha_atual", primeira: false, item, travadas: [] })
        );
        const token = await tokenDaSessao(credencial.id, credencial.sessao_versao, item);
        return respostaDaSessao(token, item);
      }

      // confirmar e trocar: a geração não sobe (as outras empresas continuam liberadas), todas as sessões caem e a
      // origem só zera quando a provisória é de outra empresa (origemDepoisDaTroca)
      const motivo = motivoSenhaInvalida(nova, credencial.usuario);
      if (motivo) return fail(motivo, 400);
      if (nova === atual) return fail("A nova senha tem de ser diferente da atual", 400);
      const efeito = efeitoDaConfirmacao({ credencial, item, agora, troca: true });
      const { data: trocadas, error: erroTroca } = await supabase
        .from("portal_credencial")
        .update({ ...efeito.credencial, senha_hash: await hashPassword(nova) })
        .eq("id", credencial.id)
        .eq("senha_hash", credencial.senha_hash)
        .select("id");
      if (erroTroca) return fail("Erro ao salvar a senha", 500);
      if (!trocadas?.length) return fail(MSG_ATIVACAO_VENCIDA, 409, { codigo: "ATIVACAO" });
      if (!(await liberarVinculo(efeito.vinculo))) return vinculoNaoLiberado();
      await gravarEventos(
        supabase,
        req,
        credencial.id,
        eventosDaAtivacao({ forma: "troca", primeira: false, item, travadas: [] })
      );
      const token = await tokenDaSessao(
        credencial.id,
        efeito.credencial.sessao_versao ?? credencial.sessao_versao + 1,
        item
      );
      return respostaDaSessao(token, item);
    }

    // --------------------------------------------------------------- sessão
    // A conferência de toda ação com sessão (§5.3, `sessaoValida`): escopo de sessão; a credencial existe e a versão
    // dela (`vc`) confere; o vínculo é do funcionário, da credencial e da empresa do token, com a versão `v`; o
    // cadastro é da empresa do token, ativo, com o mesmo CPF; e o vínculo está liberado. Token de antes da T38 (sem
    // `credencial_id`) cai aqui. Depois dela, todas as ações filtram pela empresa e pelo funcionário do TOKEN.
    const payload = body.token ? await verifyPortalToken(body.token) : null;
    const credencialId = typeof payload?.credencial_id === "string" ? payload.credencial_id : "";
    const funcionarioId = typeof payload?.funcionario_id === "string" ? payload.funcionario_id : "";
    const empresaId = typeof payload?.empresa_id === "string" ? payload.empresa_id : "";
    if (
      !payload ||
      payload.scope !== ESCOPO_SESSAO ||
      !credencialId ||
      !funcionarioId ||
      !empresaId
    ) {
      return fail("Entre com seu usuário e senha para continuar", 401, { codigo: "SESSAO" });
    }
    const [
      { data: credencial, error: erroCredencial },
      { data: vinculoDaSessao, error: erroVinculo },
      { data: funcionarioSessao, error: erroFuncionarioSessao },
    ] = await Promise.all([
      supabase
        .from("portal_credencial")
        .select(COLUNAS_CREDENCIAL)
        .eq("id", credencialId)
        .maybeSingle(),
      supabase
        .from("funcionario_portal_acesso")
        .select(COLUNAS_VINCULO)
        .eq("funcionario_id", funcionarioId)
        .maybeSingle(),
      supabase
        .from("funcionario")
        .select("id, empresa_id, cpf, ativo, deleted_at")
        .eq("id", funcionarioId)
        .eq("empresa_id", empresaId)
        .maybeSingle(),
    ]);
    if (erroCredencial || erroVinculo || erroFuncionarioSessao) {
      return fail("Não foi possível validar seu acesso", 503);
    }
    const sessaoConferida = sessaoValida({
      payload,
      credencial,
      vinculo: vinculoDaSessao,
      cadastro: funcionarioSessao,
      agora: Date.now(),
    });
    if (!sessaoConferida.ok) {
      return sessaoConferida.motivo === "cadastro_inativo"
        ? fail("Cadastro inativo — fale com o RH", 401, { codigo: "SESSAO" })
        : fail("Sua sessão terminou — entre de novo", 401, { codigo: "SESSAO" });
    }
    const ev = (e: Omit<EventoPortal, "empresa_id" | "funcionario_id">) =>
      registrarEvento(supabase, req, {
        empresa_id: empresaId,
        funcionario_id: funcionarioId,
        ...e,
      });
    // A trilha ficou completa (última aula ou aprovação) e a conclusão não pôde ser gravada: a marca que a abertura
    // do portal usa para retomar SÓ esta matrícula (A6, revisão 2). Só as ações de aula e de prova a usam.
    // deno-lint-ignore no-explicit-any
    const adiarConclusao = (mat: any) => (motivo: MotivoDaConclusaoAdiada) =>
      ev({
        evento: EVENTO_CONCLUSAO_ADIADA,
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        detalhe: { motivo },
      });
    // A matrícula foi concluída pela aula, pela prova ou pelo pedido de certificado: se havia uma conclusão adiada
    // pendente, grava `conclusao_registrada` e fecha a marca (A7). Nunca lança: a conclusão já está gravada.
    const fecharAdiada = (
      // deno-lint-ignore no-explicit-any
      mat: any,
      dataConclusao: string | null,
      origem: "aula" | "prova" | "certificado"
    ) =>
      fecharConclusaoAdiada({
        matriculaId: mat.id,
        lerAdiadas: (ids) =>
          conclusoesAdiadasDoBanco(supabase, { empresaId, funcionarioId, matriculaIds: ids }),
        registrarConclusao: () =>
          ev({
            evento: EVENTO_CONCLUSAO_REGISTRADA,
            matricula_id: mat.id,
            curso_id: mat.curso_id,
            detalhe: { data_conclusao: dataConclusao, origem },
          }),
        registrar: (mensagem, causa) => console.error(`[portal-funcionario] ${mensagem}`, causa),
      });

    // Reconfirmação da senha com a sessão aberta (assinar o certificado e trocar a senha informando a
    // atual): limite de tentativas por PESSOA (a credencial: duas sessões em empresas diferentes não dobram o
    // teto, T38 §5.5), em escopo próprio, consumido ANTES de conferir (T27).
    const reconfirmar = (senha: string) =>
      reconfirmarSenha({
        funcionarioId: credencialId,
        senha,
        consumir: (escopo, janelaSeg, limites) =>
          consumirTentativa(supabase, escopo, janelaSeg, limites),
        conferir: async () =>
          !!credencial.senha_hash && (await verifyPassword(senha, credencial.senha_hash)).ok,
        liberar: (consumo) => liberarTentativas(supabase, consumo),
      });
    const muitasTentativas = () => fail(MSG_MUITAS_TENTATIVAS, 429, { codigo: "LIMITE" });
    // Volume de `evento` e `progresso` (T31): teto por PESSOA (T38 §5.5), consumido ANTES do trabalho. O evento
    // tem três tetos (`acaoDeVolumeDoEvento`): abrir_aula, play/pausa e o resto, para o play repetido do
    // vídeo não travar a troca de aula. Fora do ar, o limitador não derruba o portal (`consumirTentativa`
    // libera e registra o erro).
    const dentroDoLimite = (acao: AcaoComVolume) =>
      dentroDoVolume({
        acao,
        funcionarioId: credencialId,
        consumir: (escopo, janelaSeg, limites) =>
          consumirTentativa(supabase, escopo, janelaSeg, limites),
      });
    const muitasAcoes = () => fail(MSG_MUITAS_ACOES, 429, { codigo: "LIMITE" });

    // --------------------------------------------------------- trocar senha
    // A senha é da pessoa: vale em todas as empresas e a troca derruba as sessões de todas (`vc`). A senha atual é
    // sempre obrigatória (o primeiro acesso virou a etapa "ativar"). Não sobe a geração e MANTÉM a origem da senha
    // (origemDepoisDaTroca, via sessão): quem troca aqui pode ser quem a criou.
    if (body.acao === "trocar_senha") {
      const nova = body.nova_senha ?? "";
      if (!body.senha_atual) return fail("Informe a sua senha atual", 400);
      const reconfirmacao = await reconfirmar(body.senha_atual);
      if (reconfirmacao === "limite") return muitasTentativas();
      if (reconfirmacao === "incorreta") return fail("Senha atual incorreta", 400);
      const motivo = motivoSenhaInvalida(nova, credencial.usuario);
      if (motivo) return fail(motivo, 400);
      if (credencial.senha_hash && (await verifyPassword(nova, credencial.senha_hash)).ok) {
        return fail("A nova senha tem de ser diferente da atual", 400);
      }
      const vc = credencial.sessao_versao + 1;
      const { data: trocadas, error } = await supabase
        .from("portal_credencial")
        .update({
          senha_hash: await hashPassword(nova),
          sessao_versao: vc,
          senha_alterada_em: agoraIso(),
        })
        .eq("id", credencialId)
        .eq("sessao_versao", credencial.sessao_versao)
        .select("id");
      if (error) return fail("Erro ao salvar a senha", 500);
      if (!trocadas?.length) {
        return fail("Sua senha mudou agora há pouco — entre de novo", 401, { codigo: "SESSAO" });
      }
      await ev({ evento: "troca_senha", detalhe: { via: "sessao" } });
      const token = await signPortalToken(
        {
          scope: ESCOPO_SESSAO,
          credencial_id: credencialId,
          empresa_id: empresaId,
          funcionario_id: funcionarioId,
          v: vinculoDaSessao.sessao_versao,
          vc,
        },
        TTL_SESSAO
      );
      return ok({ token });
    }

    // Sair derruba as sessões desta empresa (o vínculo), em todos os aparelhos, como antes da T38.
    if (body.acao === "logout") {
      const { error } = await supabase
        .from("funcionario_portal_acesso")
        .update({ sessao_versao: vinculoDaSessao.sessao_versao + 1 })
        .eq("funcionario_id", funcionarioId)
        .eq("empresa_id", empresaId)
        .eq("sessao_versao", vinculoDaSessao.sessao_versao);
      if (error) return fail("Não foi possível encerrar sua sessão", 500);
      await ev({ evento: "logout" });
      return ok({ message: "Até logo" });
    }

    // ------------------------------------------------- trocar de empresa (§5.4)
    // `empresas`: as OUTRAS empresas liberadas da pessoa. `trocar_empresa`: o token da escolhida, sem pedir a senha de
    // novo (a sessão já provou), que vence JUNTO com o de origem (alternar não renova a sessão para sempre). A trilha
    // da outra empresa recebe o mesmo `login` de quem entrou com a senha.
    if (body.acao === "empresas" || body.acao === "trocar_empresa") {
      const lida = await lerPessoaDoBanco(supabase, { id: credencialId });
      if (!lida.ok || !lida.credencial) {
        return fail("Não foi possível carregar as suas empresas agora. Tente de novo.", 503);
      }
      const agora = Date.now();
      if (body.acao === "empresas") {
        const outras = outrosVinculosLiberados({
          itens: lida.itens,
          credencial: lida.credencial,
          empresaId,
          agora,
        });
        return ok({ empresas: await empresasParaEscolha(supabase, outras) });
      }
      const item = vinculoEscolhido({
        itens: lida.itens,
        credencial: lida.credencial,
        funcionarioId: body.funcionario_id,
        agora,
      });
      if (!item || item.vinculo.empresa_id === empresaId) {
        return fail("Esta empresa não está disponível para você agora", 403);
      }
      const ttl = ttlDaTroca({ expOrigem: payload.exp, agoraSeg: Math.floor(agora / 1000) });
      if (ttl <= 0) return fail("Sua sessão terminou — entre de novo", 401, { codigo: "SESSAO" });
      return entrarComSenha(lida.credencial, item, ttl);
    }

    // Nenhum ID do corpo é usado: documentos sempre pertencem ao token validado.
    if (body.acao === "documentos") {
      try {
        return ok(
          await carregarDocumentos(supabase, funcionarioId, empresaId, (refs, empresa) =>
            assinarRefs(supabase, refs, empresa, 300)
          )
        );
      } catch {
        return fail("Não foi possível carregar seus documentos. Tente novamente.", 500);
      }
    }

    /**
     * Matrícula do próprio funcionário, na empresa da sessão (ou null). A RLS
     * só confere o empresa_id da linha, não o curso_id: matrícula da empresa
     * apontando para curso de OUTRA empresa é descartada.
     */
    const minhaMatricula = async (id?: string) => {
      if (!id) return null;
      const { data } = await supabase
        .from("treinamento_matricula")
        .select(COLUNAS_MATRICULA_PORTAL)
        .eq("id", id)
        .eq("funcionario_id", funcionarioId)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!data) return null;
      const { data: curso } = await supabase
        .from("treinamento_curso")
        .select("id")
        .eq("id", data.curso_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      return curso ? data : null;
    };

    // ---------------------------------------------------------------- dados
    if (body.acao === "dados") {
      const [{ data: func }, { data: emp }, { data: mats }] = await Promise.all([
        supabase
          .from("funcionario")
          .select("id, nome_completo, funcao_nome")
          .eq("id", funcionarioId)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
        supabase
          .from("empresa")
          .select("nome, razao_social, logo_url")
          .eq("id", empresaId)
          .maybeSingle(),
        supabase
          .from("treinamento_matricula")
          .select(COLUNAS_MATRICULA_PORTAL)
          .eq("funcionario_id", funcionarioId)
          .eq("empresa_id", empresaId)
          .is("deleted_at", null),
      ]);
      if (!func) return fail("Funcionário não encontrado", 404);

      const cursoIds = [...new Set((mats ?? []).map((m: { curso_id: string }) => m.curso_id))];
      const matIds = (mats ?? []).map((m: { id: string }) => m.id);
      const vazio = Promise.resolve({ data: [] });
      // curso, aulas e questões SÓ da empresa da sessão: matrícula apontando
      // para curso de outra empresa não traz nada dele (e sai da lista abaixo)
      const [
        { data: cursos },
        { data: aulas },
        { data: prog },
        { data: questoes, error: erroQuestoes },
        { data: tentativas, error: erroTentativas },
        { data: certificados },
        { data: duvidas },
        { data: liberacoes },
      ] = await Promise.all([
        cursoIds.length
          ? supabase
              .from("treinamento_curso")
              .select("*")
              .in("id", cursoIds)
              .eq("empresa_id", empresaId)
          : vazio,
        cursoIds.length
          ? supabase
              .from("treinamento_aula")
              .select("*")
              .in("curso_id", cursoIds)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
              .order("ordem", { ascending: true })
          : vazio,
        matIds.length
          ? supabase.from("treinamento_progresso").select("*").in("matricula_id", matIds)
          : vazio,
        // só para contar (tem_avaliacao e total_questoes): o texto e as alternativas saem apenas em
        // iniciar_avaliacao, já sorteados, e o gabarito nunca sai antes da aprovação (T16)
        cursoIds.length
          ? supabase
              .from("treinamento_questao")
              .select("id, curso_id")
              .in("curso_id", cursoIds)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
          : vazio,
        matIds.length
          ? supabase
              .from("treinamento_tentativa")
              .select("matricula_id, numero, nota, aprovada, created_at")
              .in("matricula_id", matIds)
              .order("numero", { ascending: true })
          : vazio,
        matIds.length
          ? supabase
              .from("treinamento_certificado")
              .select(
                "matricula_id, codigo, dados, assinatura_aluno, emitido_em, revogado_em, hash_sha256"
              )
              .in("matricula_id", matIds)
          : vazio,
        cursoIds.length
          ? supabase
              .from("treinamento_duvida")
              .select("id, curso_id, aula_id, pergunta, resposta, respondida_em, created_at")
              .eq("funcionario_id", funcionarioId)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
          : vazio,
        // liberações do RH (T18): quem foi liberado depois da última tentativa não espera o intervalo
        matIds.length
          ? supabase
              .from("treinamento_evento")
              .select("matricula_id, created_at")
              .eq("empresa_id", empresaId)
              .eq("funcionario_id", funcionarioId)
              .eq("evento", EVENTO_TENTATIVA_LIBERADA)
              .in("matricula_id", matIds)
          : vazio,
      ]);
      // Questões e tentativas decidem o que o aluno vê da prova e as duas travas da retomada da conclusão (a trilha
      // completa e "fez a prova e não passou"). Lidas com erro, viravam "curso sem prova" e "nunca fez a prova":
      // a retomada podia concluir sem aprovação e a tela mostrava o curso como pronto para o certificado. Sem elas
      // o `dados` não monta nada (A7): 503 e o portal oferece tentar de novo.
      if (erroQuestoes || erroTentativas) {
        if (erroQuestoes) {
          console.error("[portal-funcionario] dados: questões:", erroQuestoes.message);
        }
        if (erroTentativas) {
          console.error("[portal-funcionario] dados: tentativas:", erroTentativas.message);
        }
        return fail(
          "Não foi possível carregar seus cursos agora. Tente de novo em instantes.",
          503
        );
      }
      const liberadaEm = liberacoesPorMatricula(liberacoes);

      // Pré-requisito entre cursos (T23): os cursos que os do aluno exigem podem não estar na lista dele.
      // Uma consulta só, da empresa da sessão; as matrículas e os certificados vêm do que já foi lido acima.
      const cursosExigidos = await cursosExigidosDoBanco(
        supabase,
        // deno-lint-ignore no-explicit-any
        (cursos ?? []).map((c: any) => c.pre_requisito_curso_id),
        empresaId
      );
      const hojeEmBrasilia = dataBrasilia(new Date());
      // Parte prática presencial (T12): as sessões dos cursos semipresenciais do aluno e as participações das
      // matrículas dele, só da empresa da sessão. Sem curso semipresencial não consulta; falha = "pendente".
      const praticas = await praticasDoBanco(supabase, {
        cursoIds: (cursos ?? [])
          // deno-lint-ignore no-explicit-any
          .filter((c: any) => modalidadeDoCurso(c) === "semipresencial")
          // deno-lint-ignore no-explicit-any
          .map((c: any) => c.id),
        matriculaIds: matIds,
        empresaId,
      });

      // Declaração de ambiente e horário (T35): o texto em vigor da empresa e, em cada matrícula, se o aluno já
      // declarou hoje (dia de Brasília). Falha de leitura NÃO derruba o portal: sem o texto o curso abre sem a tela da
      // declaração (o RH vê o dia sem declaração no relatório) e o rastro fica nos logs.
      const [textoDaDeclaracao, declaracoesDeHoje] = await Promise.all([
        lerTextoDaDeclaracao(supabase, empresaId),
        lerDeclaracoesDoDia(supabase, {
          funcionarioId,
          empresaId,
          matriculaIds: matIds,
          agora: new Date(),
          hoje: hojeEmBrasilia,
        }),
      ]);

      const progPor = new Map(
        // deno-lint-ignore no-explicit-any
        (prog ?? []).map((p: any) => [`${p.matricula_id}|${p.aula_id}`, p])
      );
      const agora = Date.now();

      // matrícula de curso que não é da empresa fica fora da lista
      // deno-lint-ignore no-explicit-any
      const cursosDaEmpresa = new Set((cursos ?? []).map((c: any) => c.id));
      const matsDaEmpresa = (mats ?? []).filter((m: { curso_id: string }) =>
        cursosDaEmpresa.has(m.curso_id)
      );
      // aulas do curso e progresso desta matrícula (a regra de liberação está em regras.ts)
      // deno-lint-ignore no-explicit-any
      const aulasDoCurso = (cursoId: string) =>
        (aulas ?? []).filter((a: any) => a.curso_id === cursoId);
      const progressoDa =
        (matriculaId: string) =>
        (aulaId: string): ProgressoDaAula =>
          progPor.get(`${matriculaId}|${aulaId}`) as ProgressoDaAula;

      // A trilha desta matrícula está completa (todas as aulas e, se há prova, a aprovação)? É a conta de
      // `situacaoReal` feita só com o que este `dados` já leu: serve a `concluidoReal` de cada curso (abaixo) e à
      // segunda chance da conclusão.
      // deno-lint-ignore no-explicit-any
      const concluidoNaTrilha = (m: any) => {
        const aulasDaMatricula = aulasDoCurso(m.curso_id);
        const progresso = progressoDa(m.id);
        return situacaoDaTrilha({
          aulas: aulasDaMatricula,
          feitas: new Set(
            // deno-lint-ignore no-explicit-any
            aulasDaMatricula.filter((a: any) => progresso(a.id)?.concluida).map((a: any) => a.id)
          ),
          // deno-lint-ignore no-explicit-any
          temAvaliacao: (questoes ?? []).some((q: any) => q.curso_id === m.curso_id),
          aprovacao:
            // deno-lint-ignore no-explicit-any
            (tentativas ?? []).find((t: any) => t.matricula_id === m.id && t.aprovada) ?? null,
        }).concluido;
      };

      // Segunda chance da conclusão (A6, revisões 1 e 2): a matrícula que a trilha dá por completa, que o banco ainda
      // tem aberta E cuja conclusão foi ADIADA (a leitura do curso ou a gravação falhou quando o aluno terminou) é
      // concluída agora, ANTES de montar a resposta (o pré-requisito dos outros cursos lê o status). Trilha que só
      // parece completa (o RH apagou as questões de quem reprovou, ou uma aula que o aluno não fez) não é concluída
      // aqui. Só custa consultas com matrícula aberta e trilha completa; idempotente.
      await retomarConclusoes({
        matriculas: matsDaEmpresa,
        concluidoNaTrilha,
        // fez a prova e nenhuma tentativa passou: a trilha só parece completa porque não há mais questões vivas
        provaSemAprovacao: (m) => {
          // deno-lint-ignore no-explicit-any
          const dela = (tentativas ?? []).filter((t: any) => t.matricula_id === m.id);
          // deno-lint-ignore no-explicit-any
          return dela.length > 0 && !dela.some((t: any) => t.aprovada);
        },
        lerAdiadas: (ids) =>
          conclusoesAdiadasDoBanco(supabase, { empresaId, funcionarioId, matriculaIds: ids }),
        concluir: async (m) => {
          // sem `adiar`: a marca já existe, e cada abertura do portal com o curso ilegível não pode gerar outra
          const resultado = await concluirSeCompleto(supabase, m, empresaId);
          if (resultado.concluiu) {
            // o rastro de quando e como a conclusão foi registrada (não é `curso_concluido`: abrir o portal não é
            // estudar); só se a conclusão foi mesmo gravada
            await ev({
              evento: EVENTO_CONCLUSAO_REGISTRADA,
              matricula_id: m.id,
              curso_id: m.curso_id,
              detalhe: { data_conclusao: resultado.data_conclusao, origem: "retomada" },
            });
          }
          return resultado;
        },
        // a mesma leitura das outras ações: matrícula do próprio funcionário, na empresa da sessão, colunas fixas
        reler: (m) => minhaMatricula(m.id),
        registrar: (mensagem, causa) => console.error(`[portal-funcionario] ${mensagem}`, causa),
      });

      // Só as aulas LIBERADAS têm arquivo assinado (T16): a URL vale 3 h e pode ser repassada, então
      // aula bloqueada não ganha URL. A próxima aula recebe a sua quando for liberada (o portal
      // recarrega os dados ao concluir uma aula).
      const assinada = await assinarRefs(
        supabase,
        [
          ...matsDaEmpresa.flatMap((m: { id: string; curso_id: string }) =>
            refsDasAulasLiberadas(aulasDoCurso(m.curso_id), progressoDa(m.id))
          ),
          // deno-lint-ignore no-explicit-any
          ...(cursos ?? []).map((c: any) => c.projeto_pedagogico_ref),
        ],
        empresaId
      );
      const url = (ref?: string | null) => (ref ? (assinada.get(ref) ?? null) : null);

      // Imagens da assinatura do instrutor e do RT para o PDF do certificado (T29): URL assinada só da
      // pasta da empresa da sessão; a referência não vai ao aluno (`dadosParaOAluno`). Falha ao assinar =
      // PDF sem a imagem (a tela avisa); nunca derruba os `dados`, a tela inicial do portal. Só chama o
      // Storage quando o aluno tem certificado com assinatura.
      let assinadasDasAssinaturas = new Map<string, string>();
      const refsDasAssinaturasDoAluno = refsDasAssinaturas(certificados, empresaId);
      if (refsDasAssinaturasDoAluno.length) {
        try {
          assinadasDasAssinaturas = await assinarRefs(
            supabase,
            refsDasAssinaturasDoAluno,
            empresaId
          );
        } catch (erro) {
          console.error("[portal-funcionario] assinaturas do certificado não assinadas:", erro);
        }
      }

      // deno-lint-ignore no-explicit-any
      const resposta = matsDaEmpresa.map((m: any) => {
        // deno-lint-ignore no-explicit-any
        const curso: any = (cursos ?? []).find((c: any) => c.id === m.curso_id) || null;
        const aulasCurso = aulasParaAluno({
          aulas: aulasDoCurso(m.curso_id),
          progresso: progressoDa(m.id),
          urlDe: url,
          tempoMinimoPadrao: TEMPO_MINIMO_PADRAO,
        });
        // deno-lint-ignore no-explicit-any
        const questoesCurso = (questoes ?? []).filter((q: any) => q.curso_id === m.curso_id);
        // deno-lint-ignore no-explicit-any
        const tents = (tentativas ?? []).filter((t: any) => t.matricula_id === m.id);
        const { max, esgotada, aguardarAte } = situacaoDasTentativas({
          usadas: tents.length,
          curso,
          matricula: m,
          ultima: tents[tents.length - 1],
          liberadaEm: liberadaEm.get(m.id),
          agora,
        });
        // deno-lint-ignore no-explicit-any
        const cert: any = (certificados ?? []).find((c: any) => c.matricula_id === m.id) || null;
        // o que impede EMITIR (D3: o curso de apoio publica e matricula, mas nunca emite)
        const pendencias = pendenciasParaEmitir(
          requisitosDoCurso({
            curso: curso || {},
            aulas: (aulas ?? []).filter((a: { curso_id: string }) => a.curso_id === m.curso_id),
            questoes: questoesCurso,
          })
        );
        const concluidoReal = concluidoNaTrilha(m);
        // o curso exige outro? (null = não exige). Só emite com o curso exigido concluído e válido (T23)
        const preRequisito = preRequisitoDoCurso({
          curso,
          cursosExigidos,
          matriculas: matsDaEmpresa,
          certificados: certificados ?? [],
          hoje: hojeEmBrasilia,
        });
        // a parte prática do semipresencial (null nos outros cursos): só emite com ela realizada (T12)
        const pratica = praticaParaOAluno({
          curso,
          matricula: m,
          sessoes: praticas.sessoes,
          participacoes: praticas.participacoes,
          hoje: hojeEmBrasilia,
        });
        return {
          // a nota de quem ainda não foi aprovado não vai ao navegador (T16)
          matricula: matriculaParaAluno(m),
          curso: curso && {
            id: curso.id,
            nome: curso.nome,
            codigo: curso.codigo,
            descricao: curso.descricao,
            carga_horaria_horas: curso.carga_horaria_horas,
            projeto_pedagogico_url: url(curso.projeto_pedagogico_ref),
            tem_avaliacao: questoesCurso.length > 0,
            // o portal mostra um selo quando o RH despublicou o curso (T14)
            ativo: cursoPublicado(curso),
            // "apoio" é material de estudo e não emite certificado (T8): o portal explica isso
            modalidade: modalidadeDoCurso(curso),
            // o tutor do curso (T21, D4): o aluno vê o nome e o atendimento (horário e prazo de resposta);
            // o telefone fica só no servidor
            ...tutorParaOAluno(curso),
            // do projeto pedagógico (T25) o aluno recebe só o prazo para concluir e a dedicação diária; o texto
            // do projeto chega pelo PDF (`projeto_pedagogico_url`)
            ...projetoParaOAluno(curso),
          },
          aulas: aulasCurso,
          // as questões NÃO vão aqui (T16): saem sorteadas, sem gabarito, em iniciar_avaliacao
          avaliacao: {
            total_questoes: questoesCurso.length,
            tentativas_usadas: tents.length,
            tentativas_max: max,
            limite_atingido: esgotada && !m.avaliacao_aprovada,
            proxima_em: aguardarAte !== null ? new Date(aguardarAte).toISOString() : null,
            nota_minima: curso?.nota_minima ?? NOTA_MINIMA_PADRAO,
          },
          certificado: cert && {
            codigo: cert.codigo,
            dados: dadosParaOAluno(cert.dados, empresaId, (ref) =>
              assinadasDasAssinaturas.get(ref)
            ),
            assinatura_aluno: cert.assinatura_aluno,
            emitido_em: cert.emitido_em,
            hash_sha256: cert.hash_sha256,
            revogado: !!cert.revogado_em,
          },
          // curso de apoio nunca emite (a modalidade também é um dos requisitos acima)
          pode_emitir_certificado:
            concluidoReal &&
            !cert &&
            pendencias.length === 0 &&
            emiteCertificado(modalidadeDoCurso(curso)) &&
            preRequisito?.atendido !== false &&
            (pratica === null || pratica.situacao === "realizada"),
          pendencias_certificado: pendencias.map((r) => r.texto),
          // o curso exigido antes deste e se o aluno já o cumpriu (T23); a tela explica o que falta
          pre_requisito: preRequisito,
          // "Parte prática: pendente" ou "realizada em DD/MM, em <local>" (T12); null fora do semipresencial. Com o
          // certificado emitido vale a prática congelada nele: o RH apagar uma sessão depois não pode mostrar
          // "pendente" ao lado do certificado válido (A6). A emissão confere sempre as sessões vivas.
          pratica: (cert ? praticaDoCertificado(cert.dados) : null) ?? pratica,
          // o aluno já declarou o ambiente e o horário hoje neste curso (T35)? null = não deu para saber (o portal
          // não mostra a tela da declaração)
          declaracao_hoje:
            textoDaDeclaracao.ok && declaracoesDeHoje.ok
              ? { dia: hojeEmBrasilia, declarada: declaracoesDeHoje.declaradas.has(m.id) }
              : null,
          // deno-lint-ignore no-explicit-any
          duvidas: (duvidas ?? []).filter((d: any) => d.curso_id === m.curso_id),
        };
      });

      // todas as pendentes + as últimas confirmadas (só o histórico tem limite; ciencia.ts). Falha só desta
      // lista (a causa já foi para o log) NÃO derruba os cursos: sai `ciencias: null` e o portal avisa que as
      // entregas não carregaram, em vez de esconder as pendentes em silêncio ou tirar a tela de cursos do ar.
      const listaDeCiencias = await listarCienciasDoAluno(supabase, { funcionarioId, empresaId });

      // Logo da empresa para o PDF do certificado (T15): URL assinada só da pasta da empresa da
      // sessão. Só vale a chamada ao Storage quando o aluno tem certificado para baixar; quem
      // emite um agora recarrega os `dados` e recebe o logo junto.
      const empresaLogoUrl = (certificados ?? []).length
        ? await logoAssinadoParaPdf(
            emp?.logo_url,
            // falha ao assinar = PDF sem logo para o aluno; o rastro fica nos logs da função
            comRastroDeFalha(
              (refs: string[]) => assinarDaEmpresa(supabase, refs, empresaId),
              (erro) => console.error("[portal-funcionario] logo da empresa não assinado:", erro)
            )
          )
        : null;

      // Quantas OUTRAS empresas da pessoa estão liberadas (T38): com uma ou mais, o portal mostra "Trocar de
      // empresa". Só conta quem já provou a senha; nada de "empresas esperando" (defesa 3). Falha de leitura = 0.
      const pessoa = await lerPessoaDoBanco(supabase, { id: credencialId });
      const outrasEmpresas =
        pessoa.ok && pessoa.credencial
          ? outrasEmpresasLiberadas({
              itens: pessoa.itens,
              credencial: pessoa.credencial,
              empresaId,
              agora: Date.now(),
            })
          : 0;

      return ok({
        funcionario: func,
        empresa_nome: emp?.nome || emp?.razao_social || "",
        empresa_logo_url: empresaLogoUrl,
        outras_empresas: outrasEmpresas,
        cursos: resposta,
        ciencias: listaDeCiencias.ok ? listaDeCiencias.ciencias : null,
        // a orientação do RT que o aluno confirma ao abrir o curso (T35); null = leitura falhou
        declaracao_ambiente: textoDaDeclaracao.ok
          ? declaracaoParaOAluno(textoDaDeclaracao.vigente)
          : null,
      });
    }

    // --------------------------------------------------------------- evento
    if (body.acao === "evento") {
      if (!(await dentroDoLimite(acaoDeVolumeDoEvento(body.evento)))) return muitasAcoes();
      const nome = body.evento ?? "";
      if (!EVENTOS_CLIENTE.has(nome)) return fail("Evento inválido", 400);
      const mat = await minhaMatricula(body.matricula_id);
      if (body.matricula_id && !mat) return fail("Matrícula não encontrada", 404);
      // aula informada tem de ser do curso da matrícula (na empresa da sessão)
      if (body.aula_id && nome !== "abrir_aula") {
        if (!mat) return fail("matricula_id é obrigatório com aula_id", 400);
        if (!(await aulaDoCurso(supabase, body.aula_id, mat.curso_id, empresaId))) {
          return fail("Aula não pertence ao curso", 400);
        }
      }

      if (nome === "abrir_aula") {
        if (!mat || !body.aula_id) return fail("matricula_id e aula_id são obrigatórios", 400);
        const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId);
        // leitura que falhou não é "aula de outro curso" nem "aula bloqueada" (A7)
        if (!trilha.lida) return fail(MSG_TRILHA_INDISPONIVEL, 503);
        if (!trilha.aulas.some((a: { id: string }) => a.id === body.aula_id)) {
          return fail("Aula não pertence ao curso", 400);
        }
        if (!aulaLiberada(trilha, body.aula_id)) {
          return fail("Conclua a aula anterior primeiro", 409, { codigo: "AULA_BLOQUEADA" });
        }
        // o relógio da aula começa agora (é da PESSOA: duas empresas ao mesmo tempo dividem o relógio, T38 §5.5)
        await supabase
          .from("portal_credencial")
          .update({ ultimo_sinal_em: agoraIso() })
          .eq("id", credencialId);
        if (!mat.iniciado_em || mat.status === "pendente") {
          await supabase
            .from("treinamento_matricula")
            .update({
              iniciado_em: mat.iniciado_em ?? agoraIso(),
              status: mat.status === "pendente" ? "em_andamento" : mat.status,
            })
            .eq("id", mat.id);
        }
      }
      await ev({
        evento: nome,
        matricula_id: mat?.id ?? null,
        curso_id: mat?.curso_id ?? null,
        aula_id: body.aula_id ?? null,
        detalhe: detalheLimitado(body.detalhe),
        // quem relata é o navegador do aluno: o servidor só carimba a hora e o IP (T17)
        origem: "navegador",
      });
      return ok({ registrado: true });
    }

    // ---------------------------------------------------- declaração de ambiente
    // 1ª abertura do curso em cada dia (T35; NR-1, Anexo II, 4.3 e 4.4): o aluno confirma a orientação do RT e os
    // três itens. A matrícula é a do aluno da sessão; o texto vem do banco (só da empresa da sessão) e o aluno
    // confirma a VERSÃO que leu; o evento vai para a trilha como evento de SERVIDOR, com o texto inteiro. Uma por
    // matrícula e dia: repetir no mesmo dia responde ok sem gravar outra.
    if (body.acao === "declarar_ambiente") {
      // teto do evento (A6, T35): sem ele, um script com o token do aluno repetia o pedido em paralelo e enchia a
      // trilha (só de inclusão) de declarações do mesmo dia
      if (!(await dentroDoLimite(acaoDeVolumeDoEvento(EVENTO_DECLARACAO_AMBIENTE)))) {
        return muitasAcoes();
      }
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);
      const hoje = dataBrasilia(new Date());
      const jaDeclarou = await lerDeclaracoesDoDia(supabase, {
        funcionarioId,
        empresaId,
        matriculaIds: [mat.id],
        agora: new Date(),
        hoje,
      });
      if (!jaDeclarou.ok) {
        return fail("Não foi possível registrar a declaração agora. Tente de novo.", 503);
      }
      if (jaDeclarou.declaradas.has(mat.id)) {
        return ok({ declarada: true, ja_declarada: true, dia: hoje });
      }
      const texto = await lerTextoDaDeclaracao(supabase, empresaId);
      if (!texto.ok) {
        return fail("Não foi possível registrar a declaração agora. Tente de novo.", 503);
      }
      const conferida = validarDeclaracao(body, texto.vigente);
      if (!conferida.ok) {
        return fail(conferida.mensagem, conferida.status, { codigo: conferida.codigo });
      }
      const gravado = await ev({
        evento: EVENTO_DECLARACAO_AMBIENTE,
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        detalhe: detalheDaDeclaracao({ vigente: texto.vigente, dia: hoje }),
      });
      // sem a linha na trilha a declaração não existe: o aluno não pode achar que declarou
      if (!gravado)
        return fail("Não foi possível registrar a declaração agora. Tente de novo.", 503);
      return ok({ declarada: true, ja_declarada: false, dia: hoje, versao: texto.vigente.versao });
    }

    // ------------------------------------------------------------ progresso
    if (body.acao === "progresso") {
      if (!(await dentroDoLimite("progresso"))) return muitasAcoes();
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat || !body.aula_id) return fail("Matrícula não encontrada", 404);
      const trilha = await trilhaDoCurso(supabase, mat.curso_id, mat.id, empresaId);
      // leitura que falhou não é "aula de outro curso" nem "aula bloqueada": nada é creditado (A7)
      if (!trilha.lida) return fail(MSG_TRILHA_INDISPONIVEL, 503);
      // deno-lint-ignore no-explicit-any
      const aula: any = trilha.aulas.find((a: { id: string }) => a.id === body.aula_id);
      if (!aula) return fail("Aula não pertence ao curso", 400);
      if (!aulaLiberada(trilha, aula.id)) {
        return fail("Conclua a aula anterior primeiro", 409, { codigo: "AULA_BLOQUEADA" });
      }

      const duracao = duracaoParaProgresso(aula, TEMPO_MINIMO_PADRAO);
      if (duracao === null) {
        return fail("Esta aula está sem duração cadastrada — avise o RH", 409, {
          codigo: "AULA_SEM_DURACAO",
        });
      }

      const { data: atual } = await supabase
        .from("treinamento_progresso")
        .select("*")
        .eq("matricula_id", mat.id)
        .eq("aula_id", aula.id)
        .maybeSingle();
      const jaTinha = atual?.segundos_assistidos ?? 0;

      // O navegador informa o total; o servidor só aceita o que cabe no tempo
      // real passado desde o último sinal deste funcionário (qualquer aba/aula).
      const agora = Date.now();
      const { decorrido, pedido, aceito, novoSeg, ajustado } = creditarTempo({
        jaTinha,
        informado: body.segundos_assistidos,
        ultimoSinalEm: credencial.ultimo_sinal_em,
        agora,
        duracao,
      });

      // Trava otimista (T31): o sinal só é gravado se ninguém o mudou desde que este pedido o leu (a
      // `credencial` do começo). Dois progressos simultâneos liam o mesmo sinal e creditavam o mesmo tempo
      // decorrido, cada um; agora o UPDATE do Postgres deixa passar só o primeiro, e o outro responde 409
      // sem creditar nada (o navegador reenvia o total no próximo ciclo). O sinal é da PESSOA (T38 §5.5): um
      // curso da A e outro da B ao mesmo tempo não somam o dobro (período exclusivo, NR-1 Anexo II 4.4).
      const { data: sinalGravado, error: erroSinal } = await travaDoSinal(
        supabase
          .from("portal_credencial")
          .update({ ultimo_sinal_em: new Date(agora).toISOString() })
          .eq("id", credencialId),
        credencial.ultimo_sinal_em
      ).select("id");
      const sinal = resultadoDoSinal({ erro: erroSinal, linhas: sinalGravado?.length });
      if (sinal === "erro") {
        console.error("[portal-funcionario] sinal do progresso:", erroSinal);
        return fail("Erro ao salvar progresso", 500);
      }
      if (sinal === "mudou") {
        return fail(MSG_SINAL_CONCORRENTE, 409, { codigo: "SINAL_CONCORRENTE" });
      }
      if (ajustado) {
        await ev({
          evento: "progresso_ajustado",
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: { pedido, aceito, decorrido: Math.round(decorrido) },
        });
      }

      // vídeo conclui sozinho aos 90% assistidos; apostila (pdf/texto) exige o
      // tempo de leitura COMPLETO e o clique explícito em "Marcar como lida"
      const { ehVideo, concluirCedo, faltamSeg, concluiu, podeConcluir } = conclusaoDaAula({
        tipo: aula.tipo,
        duracao,
        segundos: novoSeg,
        jaConcluida: atual?.concluida,
        pediuConcluir: body.concluir,
      });
      if (concluirCedo) {
        const faltam = Math.ceil(faltamSeg / 60);
        return fail(`Continue lendo: ainda faltam ${faltam} min do tempo mínimo de leitura.`, 409, {
          codigo: "TEMPO_LEITURA",
          segundos_assistidos: novoSeg,
          faltam_seg: faltamSeg,
        });
      }
      const { error: upErr } = await supabase.from("treinamento_progresso").upsert(
        {
          empresa_id: empresaId,
          matricula_id: mat.id,
          aula_id: aula.id,
          segundos_assistidos: novoSeg,
          concluida: concluiu,
          concluida_em: concluiu && !atual?.concluida ? agoraIso() : (atual?.concluida_em ?? null),
        },
        { onConflict: "matricula_id,aula_id" }
      );
      if (upErr) {
        console.error("[portal-funcionario] progresso:", upErr);
        return fail("Erro ao salvar progresso", 500);
      }

      let resultado = {
        status: mat.status,
        concluiu: false,
        precisaAvaliacao: false,
        data_conclusao: null as string | null,
      };
      if (concluiu && !atual?.concluida) {
        if (!ehVideo) {
          await ev({
            evento: "apostila_lida",
            matricula_id: mat.id,
            curso_id: mat.curso_id,
            aula_id: aula.id,
            detalhe: { segundos: novoSeg, minimo: duracao },
          });
        }
        await ev({
          evento: "aula_concluida",
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          aula_id: aula.id,
          detalhe: { segundos: novoSeg, duracao },
        });
        resultado = await concluirSeCompleto(supabase, mat, empresaId, adiarConclusao(mat));
        if (resultado.concluiu) {
          await ev({ evento: "curso_concluido", matricula_id: mat.id, curso_id: mat.curso_id });
          await fecharAdiada(mat, resultado.data_conclusao, "aula");
        }
      }
      if (resultado.status !== mat.status && resultado.status !== "concluido") {
        await supabase
          .from("treinamento_matricula")
          .update({ status: resultado.status })
          .eq("id", mat.id);
      }

      return ok({
        segundos_assistidos: novoSeg,
        pode_concluir: podeConcluir,
        aula_concluida: concluiu,
        curso_concluido: resultado.concluiu,
        precisa_avaliacao: resultado.precisaAvaliacao && !mat.avaliacao_aprovada,
        status: resultado.status,
      });
    }

    // ------------------------------------------------------------ avaliação
    // A prova é do SERVIDOR (T16). `iniciar_avaliacao` confere se o aluno pode fazê-la, sorteia a ordem
    // das questões e das alternativas (sorteio criptográfico), grava o sorteio na trilha (evento
    // `avaliacao_iniciada`, com a hora do servidor) e devolve as questões SEM gabarito. `avaliacao` só
    // aceita o envio de uma prova iniciada nesta tentativa e completa, e corrige com a ordem que o
    // servidor gravou: o navegador não escolhe a ordem, não define o início nem o tempo.
    // As duas ações começam por `prepararProva` (prova.ts): ela confere se a matrícula pode fazer a prova e lê
    // o que a prova precisa. Com qualquer leitura ilegível (aulas, progresso, questões, curso, tentativas ou
    // liberações) responde 503 ANTES de abrir, corrigir ou gravar a tentativa (A7): a tentativa aprovada é
    // imutável e a conclusão decide a partir dela.

    /** O último início de prova gravado nesta matrícula (a linha da trilha), ou erro de leitura. */
    // deno-lint-ignore no-explicit-any
    const ultimoInicioDaProva = (mat: any) =>
      supabase
        .from("treinamento_evento")
        .select("created_at, detalhe")
        .eq("matricula_id", mat.id)
        .eq("empresa_id", empresaId)
        .eq("evento", EVENTO_PROVA_INICIADA)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (body.acao === "iniciar_avaliacao") {
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);
      const preparo = await prepararProva(supabase, mat, empresaId, false);
      if (preparo.falha) return recusaDaProva(preparo.falha);
      const { questoes, curso, max } = preparo;
      const numero = preparo.usadas + 1;

      // Prova já aberta nesta tentativa (o aluno recarregou a página ou voltou às aulas e abriu de novo):
      // mantém o mesmo sorteio e a hora do primeiro início, e não grava outro evento. Se o RH mexeu nas
      // questões nesse meio tempo, a ordem gravada não confere e a prova é sorteada de novo.
      const { data: gravado, error: erroLeitura } = await ultimoInicioDaProva(mat);
      if (erroLeitura) return fail("Não foi possível abrir a prova. Tente de novo.", 503);
      const inicio = inicioDaProva(gravado);
      let prova =
        inicio && inicio.tentativa === numero ? provaDaOrdem(questoes, inicio.ordem) : null;
      if (!prova) {
        prova = sortearProva(questoes, inteiroAleatorioSeguro);
        const gravou = await ev({
          evento: EVENTO_PROVA_INICIADA,
          matricula_id: mat.id,
          curso_id: mat.curso_id,
          detalhe: detalheDaProvaIniciada({ tentativa: numero, agora: Date.now(), prova }),
        });
        // sem o início na trilha o envio seria recusado: melhor nem abrir a prova
        if (!gravou) return fail("Não foi possível abrir a prova. Tente de novo.", 503);
      }

      return ok({
        tentativa: numero,
        tentativas_max: max,
        nota_minima: curso?.nota_minima ?? NOTA_MINIMA_PADRAO,
        // só o que o aluno vê: sem `correta`, sem `comentario`
        questoes: prova.map(({ id, pergunta, opcoes, ordem_opcoes }) => ({
          id,
          pergunta,
          opcoes,
          ordem_opcoes,
        })),
      });
    }

    if (body.acao === "avaliacao") {
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);
      const preparo = await prepararProva(supabase, mat, empresaId, true);
      if (preparo.falha) return recusaDaProva(preparo.falha);
      const { questoes, curso, max } = preparo;
      const numero = preparo.usadas + 1;

      // início desta tentativa, resposta de todas as questões e tempo mínimo (regras em regras.ts)
      const { data: gravado, error: erroLeitura } = await ultimoInicioDaProva(mat);
      if (erroLeitura) return fail("Não foi possível validar a prova. Tente de novo.", 503);
      const envio = validarEnvio({
        questoes,
        respostas: body.respostas,
        inicio: inicioDaProva(gravado),
        numero,
        agora: Date.now(),
        tempoMinimoPorQuestaoSeg: TEMPO_MINIMO_PROVA_POR_QUESTAO_SEG,
      });
      if (!envio.ok) {
        return fail(envio.mensagem, envio.status, { codigo: envio.codigo, ...envio.extra });
      }

      // a ordem exibida é a que o SERVIDOR sorteou (não a que o navegador diz ter mostrado)
      const exibicao = new Map(
        envio.prova.map((q, i) => [q.id, { posicao: i + 1, ordem_opcoes: q.ordem_opcoes }])
      );
      const { marcada, acertou, acertos, nota, minima, aprovada } = corrigirProva({
        questoes,
        respostas: envio.respostas,
        notaMinima: curso?.nota_minima,
      });

      const { error: tErr } = await supabase.from("treinamento_tentativa").insert({
        empresa_id: empresaId,
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        funcionario_id: funcionarioId,
        numero,
        // deno-lint-ignore no-explicit-any
        prova: questoes.map((q: any) => ({
          questao_id: q.id,
          ordem: q.ordem,
          pergunta: q.pergunta,
          opcoes: q.opcoes,
          correta: q.correta,
        })),
        // deno-lint-ignore no-explicit-any
        respostas: questoes.map((q: any) => ({
          questao_id: q.id,
          resposta: marcada.get(q.id) ?? null,
          acertou: acertou(q),
          posicao_exibida: exibicao.get(q.id)?.posicao ?? null,
          ordem_opcoes_exibida: exibicao.get(q.id)?.ordem_opcoes ?? null,
        })),
        acertos,
        total: questoes.length,
        nota,
        aprovada,
        ...origemDaRequisicao(req),
      });
      if (tErr) {
        // unique(matricula_id, numero): envio duplo simultâneo
        return fail("Esta tentativa já foi registrada — recarregue a página", 409);
      }
      await supabase
        .from("treinamento_matricula")
        .update({ nota_avaliacao: nota, avaliacao_aprovada: aprovada, avaliacao_em: agoraIso() })
        .eq("id", mat.id);
      await ev({
        evento: "avaliacao_envio",
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        detalhe: { tentativa: numero, nota, aprovada },
      });

      // Aviso ao RH (T24): reprovou na última tentativa que tinha. O nome do aluno e do curso saem do
      // banco pela sessão (empresa e funcionário do token), nunca do corpo; qualquer falha aqui só vai
      // para o log e não muda a resposta da prova.
      if (esgotouAsTentativas({ aprovada, numero, max })) {
        try {
          const [{ data: cursoAviso }, { data: funcionarioAviso }] = await Promise.all([
            supabase
              .from("treinamento_curso")
              .select("nome")
              .eq("id", mat.curso_id)
              .eq("empresa_id", empresaId)
              .maybeSingle(),
            supabase
              .from("funcionario")
              .select("nome_completo")
              .eq("id", funcionarioId)
              .eq("empresa_id", empresaId)
              .maybeSingle(),
          ]);
          await avisarGestores(
            supabase,
            empresaId,
            avisoDeTentativasEsgotadas({
              matriculaId: mat.id,
              numero,
              max,
              funcionarioNome: funcionarioAviso?.nome_completo,
              cursoNome: cursoAviso?.nome,
            })
          );
        } catch (e) {
          console.error("[portal-funcionario] aviso ao RH:", (e as Error)?.message);
        }
      }

      let concluiu = false;
      if (aprovada) {
        // concluirSeCompleto confere a tentativa aprovada recém-gravada
        const r = await concluirSeCompleto(supabase, mat, empresaId, adiarConclusao(mat));
        concluiu = r.concluiu;
        if (concluiu) {
          await ev({ evento: "curso_concluido", matricula_id: mat.id, curso_id: mat.curso_id });
          await fecharAdiada(mat, r.data_conclusao, "prova");
        }
      }

      // Correção comentada só após aprovar: antes disso, a nova tentativa
      // viraria cópia do gabarito.
      const revisao = aprovada
        ? // deno-lint-ignore no-explicit-any
          questoes.map((q: any) => ({
            questao_id: q.id,
            acertou: acertou(q),
            resposta_correta: (q.opcoes as string[] | null)?.[q.correta] ?? null,
            comentario: q.comentario ?? null,
          }))
        : null;
      const liberaMs = proximaTentativaEm(aprovada, curso?.intervalo_tentativa_min, Date.now());
      const liberaEm = liberaMs !== null ? new Date(liberaMs).toISOString() : null;

      // Reprovado: "insatisfatório", tentativas e próxima liberação; nota, acertos e total só enquanto
      // REPROVADO_VE_NOTA (D10: hoje `false`, o reprovado não recebe; eles deixariam deduzir o gabarito).
      // Aprovado: como antes.
      // Regra em regras.ts.
      return ok(
        respostaDaCorrecao({
          aprovada,
          nota,
          notaMinima: minima,
          acertos,
          total: questoes.length,
          tentativa: numero,
          tentativasMax: max,
          proximaEm: liberaEm,
          cursoConcluido: concluiu,
          revisao,
        })
      );
    }

    // ---------------------------------------------------------- certificado
    // Emissão = assinatura eletrônica do aluno: ele confirma a declaração com
    // a SENHA pessoal (só ele conhece), e o servidor registra quando/de onde.
    if (body.acao === "certificado") {
      let mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);

      const { data: existente, error: erroExistente } = await supabase
        .from("treinamento_certificado")
        .select("codigo, dados, assinatura_aluno, emitido_em, hash_sha256, revogado_em")
        .eq("matricula_id", mat.id)
        .maybeSingle();
      // falha de leitura não é "ainda não há certificado": seguir emitiria por cima de um que existe
      if (erroExistente) {
        console.error("[portal-funcionario] certificado: leitura do existente:", erroExistente);
        return fail("Não foi possível consultar seu certificado agora. Tente de novo.", 503);
      }
      if (existente) {
        return ok({
          certificado: certificadoParaOAluno(certificadoParaResposta(existente), empresaId),
        });
      }

      // Modalidade (T8): curso de apoio nunca emite; o semipresencial depende da prática da matrícula,
      // conferida abaixo (T12). Vem ANTES da senha: não gasta a reconfirmação do aluno à toa.
      const { data: cursoDoCertificado, error: erroCurso } = await supabase
        .from("treinamento_curso")
        .select("*")
        .eq("id", mat.curso_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      // falha de leitura é 503 (como o resto da ação), não "curso não encontrado"
      if (erroCurso) {
        console.error("[portal-funcionario] certificado: leitura do curso:", erroCurso);
        return fail("Não foi possível validar o curso agora. Tente de novo.", 503);
      }
      if (!cursoDoCertificado) return fail("Curso não encontrado", 404);
      const semEmissao = bloqueioDeEmissaoPorModalidade(modalidadeDoCurso(cursoDoCertificado));
      if (semEmissao) return fail(semEmissao.mensagem, 409, { codigo: semEmissao.codigo });

      // NR-1: conclusão recalculada aqui (progresso + tentativa aprovada), não
      // pelo status da matrícula, que a empresa grava pela API.
      // Leitura que falhou é 503 (tentar de novo), não 409 "Conclua o curso" (A7).
      const sit = await situacaoReal(supabase, mat, empresaId);
      const semTrilha = bloqueioDaTrilhaNoCertificado(sit);
      if (semTrilha) return fail(semTrilha.mensagem, semTrilha.status);

      // Pré-requisito (T23): o curso exigido concluído e dentro da validade. Vem ANTES da senha (não gasta a
      // reconfirmação à toa) e lê o banco de novo: a tela pode estar velha (o certificado do curso exigido
      // pode ter vencido ou sido revogado depois). Falha de leitura não deixa emitir.
      const pre = cursoDoCertificado.pre_requisito_curso_id
        ? await lerPreRequisito(supabase, {
            preCursoId: cursoDoCertificado.pre_requisito_curso_id,
            funcionarioId,
            empresaId,
            hoje: dataBrasilia(new Date()),
          })
        : null;
      if (pre && !pre.ok) {
        return fail("Não foi possível validar o pré-requisito do curso agora. Tente de novo.", 503);
      }
      const semPre = pre?.ok ? bloqueioDeEmissaoPorPreRequisito(pre.situacao, pre.nome) : null;
      if (semPre) return fail(semPre.mensagem, 409, { codigo: semPre.codigo });

      // Parte prática presencial (T12): o semipresencial só emite com a participação do aluno "presente" e
      // "satisfatório" numa sessão viva do curso, já realizada. Lê o banco de novo (a tela pode estar velha:
      // o RH pode ter mudado o resultado ou apagado a sessão) e vem ANTES da senha. Falha de leitura não emite.
      const praticaLida =
        modalidadeDoCurso(cursoDoCertificado) === "semipresencial"
          ? await lerPratica(supabase, {
              matriculaId: mat.id,
              cursoId: mat.curso_id,
              empresaId,
              hoje: dataBrasilia(new Date()),
              // a prática só está realizada quando a soma das sessões satisfatórias chega a esta carga
              cargaPraticaHoras: cursoDoCertificado.carga_pratica_horas,
            })
          : null;
      if (praticaLida && !praticaLida.ok) {
        return fail(
          "Não foi possível conferir a parte prática do curso agora. Tente de novo.",
          503
        );
      }
      const semPratica = praticaLida?.ok ? bloqueioDeEmissaoPorPratica(praticaLida.pratica) : null;
      if (semPratica) return fail(semPratica.mensagem, 409, { codigo: semPratica.codigo });
      // as sessões que valeram (da mais antiga em diante, até cobrir a carga); vazio fora do semipresencial
      const sessoesDaPratica = praticaLida?.ok ? praticaLida.pratica.sessoes : [];

      const reconfirmacao = await reconfirmar(body.senha ?? "");
      if (reconfirmacao === "limite") return muitasTentativas();
      if (reconfirmacao === "incorreta") {
        return fail("Senha incorreta — a assinatura não foi feita", 400);
      }

      // matrícula sem o status/data que o servidor grava ao concluir: regrava
      // antes de montar o certificado (conclusão e validade vêm dela)
      if (mat.status !== "concluido" || !mat.data_conclusao) {
        const conclusao = await concluirSeCompleto(supabase, mat, empresaId);
        // A trilha está completa (conferido acima), então não concluir aqui é falha de leitura do curso, não "o
        // curso não terminou": 503 para tentar de novo, e nunca um certificado sem a conclusão registrada (A6).
        if (!conclusao.concluiu) {
          return fail("Não foi possível registrar a conclusão do curso agora. Tente de novo.", 503);
        }
        // a conclusão que estava adiada foi registrada por aqui: fecha a marca na trilha (A7)
        await fecharAdiada(mat, conclusao.data_conclusao, "certificado");
        mat = (await minhaMatricula(mat.id)) ?? mat;
        // a releitura confirma: o certificado congela a data e a validade da matrícula, então uma matrícula que ainda
        // aparece aberta (UPDATE que não pegou, releitura que falhou) não emite
        if (mat.status !== "concluido" || !mat.data_conclusao) {
          return fail("Não foi possível registrar a conclusão do curso agora. Tente de novo.", 503);
        }
      }

      const curso = cursoDoCertificado;
      const [{ data: func }, { data: emp }, { data: aulas }] = await Promise.all([
        supabase
          .from("funcionario")
          .select("nome_completo, cpf, funcao_nome")
          .eq("id", funcionarioId)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
        supabase
          .from("empresa")
          .select("nome, razao_social, cnpj")
          .eq("id", empresaId)
          .maybeSingle(),
        supabase
          .from("treinamento_aula")
          .select(
            "ordem, modulo, titulo, tipo, fonte, video_ref, youtube_id, arquivo_ref, conteudo_texto, duracao_seg"
          )
          .eq("curso_id", mat.curso_id)
          .eq("empresa_id", empresaId)
          .is("deleted_at", null)
          .order("ordem", { ascending: true }),
      ]);
      if (!func) return fail("Funcionário não encontrado", 404);
      const { count: nQuestoes, error: erroQuestoes } = await supabase
        .from("treinamento_questao")
        .select("id", { count: "exact", head: true })
        .eq("curso_id", mat.curso_id)
        .eq("empresa_id", empresaId)
        .is("deleted_at", null);
      if (erroQuestoes) return fail("Não foi possível validar os requisitos do curso", 503);
      const pendencias = pendenciasParaEmitir(
        requisitosDoCurso({
          curso: curso || {},
          aulas: aulas || [],
          questoes: Array.from({ length: nQuestoes || 0 }, () => ({})),
        })
      );
      if (pendencias.length)
        return fail("O certificado aguarda a regularização do curso pelo RH", 409, {
          codigo: "REQUISITOS",
          pendencias: pendencias.map((r) => r.texto),
        });

      // Validade do semipresencial (T12): conta do FIM do treinamento, o maior dia entre a conclusão da teoria e o
      // último dia da prática que valeu. A `proxima_renovacao` que a matrícula guardou ao concluir a teoria é de
      // antes da prática: num curso de 12 meses com a teoria feita 13 meses antes, o certificado nasceria vencido.
      // `null` = não é semipresencial (o período fica como sempre foi).
      const periodoDoSemi = sessoesDaPratica.length
        ? periodoDoSemipresencial({
            periodo: periodoDoCertificado(mat),
            sessoes: sessoesDaPratica,
            validadeMeses: curso.validade_meses,
            modalidade: modalidadeDoCurso(curso),
          })
        : null;

      const dados = {
        aluno: { nome: func?.nome_completo, cpf: func?.cpf, funcao: func?.funcao_nome ?? null },
        empresa: { nome: emp?.razao_social || emp?.nome, cnpj: emp?.cnpj ?? null },
        curso: {
          nome: curso.nome,
          codigo: curso.codigo,
          carga_horaria_horas: curso.carga_horaria_horas,
          // semipresencial (T12): "Semipresencial: teoria EAD (X h) + prática presencial (Y h)"
          modalidade: textoDaModalidade(modalidadeDoCurso(curso), curso),
          // e as duas cargas em número (só no semipresencial: o certificado EAD não muda)
          ...(sessoesDaPratica.length
            ? {
                carga_teorica_horas: Number(curso.carga_teorica_horas),
                carga_pratica_horas: Number(curso.carga_pratica_horas),
              }
            : {}),
          conteudo_programatico: curso.conteudo_programatico || null,
          // deno-lint-ignore no-explicit-any
          aulas: (aulas ?? []).map((a: any) => ({ modulo: a.modulo, titulo: a.titulo })),
        },
        // dias de Brasília (T8); conclusão e validade já foram gravadas assim em datasDeConclusao. No
        // semipresencial o período cobre também os dias da prática e a validade conta do fim do treinamento (T12)
        periodo: periodoDoSemi ?? periodoDoCertificado(mat),
        // tipo do treinamento (T23, NR-1 1.7.1.2): inicial, periódico ou eventual (com o motivo); entra no hash
        ...dadosDoTipoNoCertificado(mat),
        // NR-1, 1.7.1.1: onde o treinamento foi realizado (no semipresencial, também o local da prática, T12)
        local: sessoesDaPratica.length
          ? localComPratica(LOCAL_DO_CERTIFICADO, sessoesDaPratica)
          : LOCAL_DO_CERTIFICADO,
        // as sessões práticas que valeram, congeladas (T12): editar a sessão depois não muda este certificado
        ...(sessoesDaPratica.length
          ? { pratica: dadosDaPraticaNoCertificado(sessoesDaPratica) }
          : {}),
        avaliacao: sit.aprovacao
          ? { nota: sit.aprovacao.nota, tentativa: sit.aprovacao.numero }
          : null,
        // nome, qualificação/registro e, quando o RH anexou, a referência da imagem da assinatura (T29).
        // Tudo congelado aqui: entra no hash, e trocar a imagem do curso depois não muda este certificado
        instrutor: instrutorDoCertificado(curso, empresaId),
        responsavel_tecnico: responsavelTecnicoDoCertificado(curso, empresaId),
      };
      const assinatura = {
        metodo: "senha_pessoal_portal_funcionario",
        usuario: credencial.usuario,
        declaracao:
          "Declaro que realizei pessoalmente este treinamento, assisti às aulas e fiz a avaliação.",
        assinado_em: agoraIso(),
        ...origemDaRequisicao(req),
        // versão do hash: a validação pública sabe se refaz o hash canônico (2) ou o antigo (sem versão)
        hash_versao: HASH_VERSAO_CANONICO,
      };

      // A matrícula passa a guardar a mesma validade que o certificado vai imprimir (o pré-requisito, os vencimentos
      // e os avisos do RH leem a da matrícula). O trigger da 0130 deixa o servidor gravar. Se não gravar, não emite:
      // validade da matrícula e do certificado divergentes é pior que pedir para tentar de novo.
      if (periodoDoSemi && periodoDoSemi.validade !== (mat.proxima_renovacao ?? null)) {
        const { error: erroValidade } = await supabase
          .from("treinamento_matricula")
          .update({ proxima_renovacao: periodoDoSemi.validade })
          .eq("id", mat.id)
          .eq("empresa_id", empresaId);
        if (erroValidade) {
          console.error("[portal-funcionario] certificado: validade da matrícula:", erroValidade);
          return fail(
            "Não foi possível calcular a validade do certificado agora. Tente de novo.",
            503
          );
        }
      }

      for (let i = 0; i < 3; i++) {
        const codigo = gerarCodigoCertificado();
        // JSON canônico (chaves ordenadas): o jsonb do banco reordena as chaves, e só assim o hash
        // dá para refazer a partir do que ficou gravado (validar-certificado confere isso)
        const hash = await hashDoCertificado(codigo, dados, assinatura);
        const { data: cert, error } = await supabase
          .from("treinamento_certificado")
          .insert({
            empresa_id: empresaId,
            matricula_id: mat.id,
            curso_id: mat.curso_id,
            funcionario_id: funcionarioId,
            codigo,
            hash_sha256: hash,
            dados,
            assinatura_aluno: assinatura,
          })
          .select("id, codigo, dados, assinatura_aluno, emitido_em, hash_sha256")
          .single();
        if (!error) {
          // O que o banco devolveu tem de dar o mesmo hash (T10, M5). Se não der, a validação pública
          // acusaria "Dados não conferem" num certificado recém-emitido: ele NÃO é entregue e é
          // anulado (revogado pelo sistema; o servidor não apaga, a trilha é só de inclusão, 0135).
          const emissao = await conferirEmissaoDoCertificado({
            hashEmitido: hash,
            gravado: cert,
            aoDivergir: (refeito) =>
              console.error(
                "[portal-funcionario] certificado: hash não reproduzível pelo banco",
                codigo,
                "gravado:",
                hash,
                "refeito:",
                refeito
              ),
            // a exceção da anulação (rede, banco) tem a causa registrada: sem isto só sobrava "NÃO anulado"
            aoFalharAnulacao: (erro) =>
              console.error("[portal-funcionario] certificado: a anulação lançou", codigo, erro),
            anular: async () => {
              const { data: anulados, error: erroAnular } = await supabase
                .from("treinamento_certificado")
                .update(dadosDaAnulacaoNaEmissao(new Date()))
                .eq("id", cert.id)
                .eq("empresa_id", empresaId)
                .is("revogado_em", null)
                .select("id");
              if (erroAnular) {
                console.error(
                  "[portal-funcionario] certificado: não anulou a emissão",
                  codigo,
                  erroAnular.message
                );
                return false;
              }
              return (anulados?.length ?? 0) > 0;
            },
          });
          if (!emissao.entregar) {
            console.error(
              "[portal-funcionario] certificado: emissão NÃO entregue (hash não reproduzível)",
              codigo,
              emissao.anulado ? "anulado" : "NÃO anulado: confira a linha"
            );
            if (emissao.anulado) {
              await ev({
                evento: EVENTO_CERTIFICADO_REVOGADO,
                matricula_id: mat.id,
                curso_id: mat.curso_id,
                detalhe: { por: POR_SISTEMA, codigo, motivo: MOTIVO_EMISSAO_ANULADA },
              });
            }
            return fail(MSG_EMISSAO_ANULADA, 500, { codigo: "EMISSAO_ANULADA" });
          }
          await ev({
            evento: "certificado_assinado",
            matricula_id: mat.id,
            curso_id: mat.curso_id,
            detalhe: { codigo },
          });
          // o id da linha só serve para anular; não vai ao navegador. A referência da assinatura também
          // não: o portal recarrega os `dados` e recebe a URL assinada (T29)
          const { id: _idDaLinha, ...certificado } = cert;
          certificado.dados = dadosParaOAluno(certificado.dados, empresaId, () => null);
          return ok({ certificado: { ...certificado, revogado: false } });
        }
        if (error.code !== "23505") {
          console.error("[portal-funcionario] certificado:", error);
          return fail("Erro ao emitir certificado", 500);
        }
        // 23505 no codigo: sorteia outro; na matricula_id: outra aba já emitiu
        const { data: jaEmitido, error: erroJaEmitido } = await supabase
          .from("treinamento_certificado")
          .select("codigo, dados, assinatura_aluno, emitido_em, hash_sha256, revogado_em")
          .eq("matricula_id", mat.id)
          .maybeSingle();
        // sem ler o erro, a falha de leitura sorteava outro código e tentava inserir de novo
        if (erroJaEmitido) {
          console.error("[portal-funcionario] certificado: leitura após o 23505:", erroJaEmitido);
          return fail("Não foi possível consultar seu certificado agora. Tente de novo.", 503);
        }
        // o certificado de outra aba pode já ter sido revogado: `revogado` vem da coluna
        if (jaEmitido) {
          return ok({
            certificado: certificadoParaOAluno(certificadoParaResposta(jaEmitido), empresaId),
          });
        }
      }
      return fail("Erro ao gerar o código do certificado — tente de novo", 500);
    }

    // ------------------------------------------------------------- ciência
    // Confirmação = assinatura eletrônica simples (Lei 14.063/2020): quem
    // (login pessoal), quando, o quê e de onde (IP/dispositivo).
    if (body.acao === "ciencia") {
      const cienciaId = body.ciencia_id;
      if (!cienciaId) return fail("ciencia_id é obrigatório", 400);
      const evidencia = {
        metodo: "portal_funcionario_login",
        usuario: credencial.usuario,
        confirmado_em: agoraIso(),
        ...origemDaRequisicao(req),
      };
      // só o servidor confirma (trigger da 0134) e só uma vez: o UPDATE exige status pendente,
      // então uma 2ª aba não sobrescreve a evidência da 1ª (regra e testes em ciencia.ts)
      const r = await confirmarCiencia(supabase, {
        cienciaId,
        funcionarioId,
        empresaId,
        evidencia,
      });
      if (r.resultado === "nao_encontrada") return fail("Registro não encontrado", 404);
      if (r.resultado === "ja_confirmada") return ok({ message: "Já confirmada" });
      if (r.resultado === "erro") return fail("Erro ao registrar ciência", 500);
      await ev({ evento: "ciencia", detalhe: { ciencia_id: cienciaId } });
      return ok({ message: "Ciência registrada", evidencia });
    }

    // -------------------------------------------------------------- dúvida
    if (body.acao === "duvida") {
      const pergunta = (body.pergunta ?? "").trim();
      if (pergunta.length < 3) return fail("Escreva sua dúvida", 400);
      if (pergunta.length > 2000) return fail("Dúvida longa demais (máx. 2000 caracteres)", 400);
      const mat = await minhaMatricula(body.matricula_id);
      if (!mat) return fail("Matrícula não encontrada", 404);
      if (body.aula_id && !(await aulaDoCurso(supabase, body.aula_id, mat.curso_id, empresaId))) {
        return fail("Aula não pertence ao curso", 400);
      }
      // cada dúvida vira um WhatsApp ao tutor: teto por funcionário
      const limite = await consumirTentativa(supabase, "portal-duvida", JANELA_DUVIDA_SEG, [
        { tipo: "conta", valor: funcionarioId, max: MAX_DUVIDAS_POR_HORA },
      ]);
      if (!limite.permitido) {
        return fail(
          "Você enviou muitas dúvidas em pouco tempo. Aguarde um pouco e envie de novo.",
          429,
          { codigo: "LIMITE" }
        );
      }

      const { data: duvida, error } = await supabase
        .from("treinamento_duvida")
        .insert({
          empresa_id: empresaId,
          curso_id: mat.curso_id,
          matricula_id: mat.id,
          funcionario_id: funcionarioId,
          aula_id: body.aula_id ?? null,
          pergunta,
        })
        .select("id, curso_id, aula_id, pergunta, resposta, respondida_em, created_at")
        .single();
      if (error) return fail("Erro ao enviar a dúvida", 500);
      await ev({
        evento: "duvida_enviada",
        matricula_id: mat.id,
        curso_id: mat.curso_id,
        aula_id: body.aula_id ?? null,
        detalhe: { duvida_id: duvida.id },
      });

      // O aviso ao tutor (T21): o curso, o aluno e a aula vêm do banco pela sessão (nunca do corpo). Só sai
      // com telefone que o envio aceita (destinoDoAvisoAoTutor); a falha do envio não derruba a dúvida, que
      // já está gravada, e a resposta diz ao portal se o tutor foi avisado.
      const [{ data: curso }, { data: func }, { data: aula }] = await Promise.all([
        supabase
          .from("treinamento_curso")
          .select("nome, tutor_telefone")
          .eq("id", mat.curso_id)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
        supabase
          .from("funcionario")
          .select("nome_completo")
          .eq("id", funcionarioId)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
        body.aula_id
          ? supabase
              .from("treinamento_aula")
              .select("titulo")
              .eq("id", body.aula_id)
              .eq("curso_id", mat.curso_id)
              .eq("empresa_id", empresaId)
              .is("deleted_at", null)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const destino = destinoDoAvisoAoTutor(curso);
      let tutorAvisado = false;
      if (destino) {
        try {
          await enviarWhatsAppTexto(
            destino,
            mensagemDuvidaAoTutor({
              cursoNome: curso?.nome,
              alunoNome: func?.nome_completo,
              aulaTitulo: aula?.titulo,
              pergunta,
            })
          );
          tutorAvisado = true;
        } catch (e) {
          console.error("[portal-funcionario] aviso ao tutor:", (e as Error)?.message);
        }
      }
      return ok({ duvida, tutor_avisado: tutorAvisado });
    }

    return fail("Ação desconhecida", 400);
  })
);
