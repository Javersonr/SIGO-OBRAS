/**
 * Portal do Funcionário com UM login (CPF e senha) em mais de uma empresa — regras puras (T38).
 *
 * Spec: docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md (aprovado pelo Javerson em 07/10/2026,
 * com as recomendações da §11: opção A, provisória por empresa que vence em 7 dias, defesas da §4.3, troca
 * obrigatória na segunda empresa, procedimento do operador pelo suporte do SIGO).
 *
 * Modelo (migração 0145):
 *  - `portal_credencial`: a PESSOA. Usuário (o CPF, ou um usuário com letras para quem não tem CPF), senha pessoal,
 *    geração da senha, empresa de origem da senha, versão da sessão, bloqueio por senhas erradas e o relógio do
 *    progresso. Não tem `empresa_id`: só o servidor lê, por id (do token) ou por usuário (do login).
 *  - `funcionario_portal_acesso`: o VÍNCULO, um por cadastro de funcionário (empresa). Ativo, versão da sessão desta
 *    empresa, senha provisória pendente (hash, criação, vencimento), geração liberada e confirmação.
 *  - `portal_credencial_evento`: o registro do operador (eventos que, na trilha de uma empresa, contariam ao RH o que
 *    a pessoa faz em outra). Só o suporte do SIGO lê.
 *
 * A empresa abre com a senha pessoal só quando o vínculo está `liberado` (geração liberada = geração da senha). Uma
 * senha criada com a provisória de uma empresa sobe a geração e TRAVA as outras até cada uma gerar a sua
 * provisória; enquanto a origem da senha não é nula, só a empresa de origem está liberada (§4.2).
 *
 * Sem `Deno.*` e sem import de URL: o `index.ts` das funções liga banco e rede; aqui só a decisão. Testes em
 * `portal-credencial.test.ts`.
 */
import { normalizarUsuario, origemDaRequisicao } from "./portal-funcionario.ts";
import {
  EVENTO_ACESSO_AGUARDANDO_PROVISORIA,
  EVENTO_ACESSO_LIBERADO,
} from "./portal-funcionario.ts";

// ------------------------------------------------------------------------------------------------- constantes

/** Escopos dos tokens do portal do funcionário. Só o de sessão abre as ações; os outros dois são intermediários. */
export const ESCOPO_SESSAO = "funcionario_sessao";
export const ESCOPO_ESCOLHA = "funcionario_escolha";
export const ESCOPO_ATIVACAO = "funcionario_ativacao";
/** O token da escolha da empresa vale 5 min; o da ativação (depois da provisória), 10 min. */
export const TTL_ESCOLHA_SEG = 5 * 60;
export const TTL_ATIVACAO_SEG = 10 * 60;
/** A senha provisória vence em 7 dias (P3). */
export const VALIDADE_PROVISORIA_DIAS = 7;
/** Comparações de senha em TODO login (uma pessoal + três provisórias), para o tempo não dizer o que existe. */
export const COMPARACOES_NO_LOGIN = 4;
export const PROVISORIAS_NO_LOGIN = COMPARACOES_NO_LOGIN - 1;
/** Bloqueio por senhas erradas: 5 erros, 15 min (é da credencial, vale em todas as empresas). */
export const MAX_FALHAS_LOGIN = 5;
export const BLOQUEIO_MIN = 15;

/**
 * Eventos do registro do operador (`portal_credencial_evento`). Nenhum vai para a trilha da empresa: lá eles
 * contariam ao RH o que a pessoa faz em outra empresa (§7). Os nomes não começam com `EVENTO_` de propósito: os
 * testes do front leem o código do servidor e exigem rótulo da trilha para toda constante `EVENTO_*`.
 */
export const OPERADOR_SENHA_CRIADA = "senha_criada";
export const OPERADOR_RESET_RECUSADO = "reset_recusado";
export const OPERADOR_ACESSO_CONFIRMADO = "acesso_confirmado";
export const OPERADOR_TROCA_SENHA = "troca_senha";
export const OPERADOR_CREDENCIAL_BLOQUEADA = "credencial_bloqueada";
export const OPERADOR_LOGIN_FALHA = "login_falha";
export const OPERADOR_REDEFINIDA = "credencial_redefinida_pelo_operador";

/** Textos das respostas do login e da ativação (a tela mostra o que o servidor manda). */
export const MSG_PEDIR_PROVISORIA =
  "Seu acesso precisa ser liberado de novo. Peça ao RH a senha provisória.";
export const MSG_RESET_NEGADO =
  'Esta senha provisória não pode criar uma senha nova. Se você já usa o portal em outra empresa, toque em "Já uso ' +
  'o portal em outra empresa" e digite a senha que você usa. Se não lembra dela, peça uma senha provisória ao RH de ' +
  "uma empresa em que você já entra. Se não entra mais em nenhuma, peça ao RH desta empresa que procure o suporte " +
  "do SIGO.";
export const MSG_ATIVACAO_VENCIDA =
  "Esta senha provisória não vale mais. Entre de novo com o CPF e a senha provisória (ou peça outra ao RH).";

// ------------------------------------------------------------------------------------------------------ tipos

export type TipoCredencial = "cpf" | "manual";

export interface CredencialDoPortal {
  id: string;
  usuario: string;
  tipo: TipoCredencial;
  senha_hash: string | null;
  senha_geracao: number;
  senha_origem_empresa_id: string | null;
  sessao_versao: number;
  tentativas: number;
  bloqueado_ate: string | null;
  ultimo_sinal_em?: string | null;
  senha_alterada_em?: string | null;
}

export interface VinculoDoPortal {
  funcionario_id: string;
  empresa_id: string;
  credencial_id: string | null;
  ativo: boolean;
  sessao_versao: number;
  provisoria_hash: string | null;
  provisoria_criada_em: string | null;
  provisoria_expira_em: string | null;
  geracao_liberada: number | null;
  confirmado_em: string | null;
  ultimo_acesso?: string | null;
}

export interface CadastroDoPortal {
  id: string;
  empresa_id: string;
  cpf?: string | null;
  ativo?: boolean | null;
  deleted_at?: string | null;
  nome_completo?: string | null;
  data_admissao?: string | null;
}

/** Um vínculo e o cadastro de funcionário dele (null = não achado na empresa do vínculo). */
export interface ItemDoVinculo {
  vinculo: VinculoDoPortal;
  cadastro: CadastroDoPortal | null;
}

export type Situacao =
  | "desativado"
  | "cadastro_inativo"
  | "cpf_mudou"
  | "aguardando_provisoria"
  | "liberado"
  | "travado";

/** Recusa com o status HTTP, o código que a tela usa e o texto para a pessoa. */
export interface Recusa {
  ok: false;
  status: number;
  codigo: string;
  mensagem: string;
}

const recusa = (status: number, codigo: string, mensagem: string): Recusa => ({
  ok: false,
  status,
  codigo,
  mensagem,
});

const iso = (ms: number) => new Date(ms).toISOString();
const MS_POR_DIA = 86_400_000;

// --------------------------------------------------------------------------------------------- CPF e usuário

export function soDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * true se o CPF tem 11 dígitos, não são todos iguais e os dois dígitos verificadores conferem. Aceita com ou sem
 * máscara; letras invalidam. É a MESMA conta de `apps/web/src/lib/cpf.js` (`validarCpf`): o teste
 * `apps/web/src/lib/portal-cpf-paridade.test.js` roda as duas sobre a mesma lista.
 */
export function cpfValido(cpf: unknown): boolean {
  const texto = String(cpf ?? "").trim();
  if (/[^\d.\-\s]/.test(texto)) return false;
  const d = soDigitos(texto);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  // pesos 10..2 (1º dígito) e 11..2 (2º dígito); resto 10 vira 0
  const dv = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9)) === Number(d[9]) && dv(d.slice(0, 10)) === Number(d[10]);
}

/**
 * O usuário do acesso (§3.3, P8). Com CPF no cadastro, é SEMPRE o CPF (só dígitos), com os dígitos verificadores
 * certos; o usuário do corpo é ignorado. Sem CPF, um usuário com letras (T27), que não se junta com nada; usuário só
 * com números é recusado, porque serviria para ligar o cadastro ao CPF de outra pessoa.
 */
export function usuarioDoAcesso(p: {
  cpf: unknown;
  usuarioInformado?: unknown;
}): { ok: true; usuario: string; tipo: TipoCredencial } | Recusa {
  if (soDigitos(p.cpf)) {
    if (!cpfValido(p.cpf)) {
      return recusa(
        400,
        "CPF_INVALIDO",
        "CPF do funcionário inválido (confira os dígitos no cadastro). Corrija o cadastro para criar o acesso."
      );
    }
    return { ok: true, usuario: soDigitos(p.cpf), tipo: "cpf" };
  }
  const usuario = normalizarUsuario(
    typeof p.usuarioInformado === "string" ? p.usuarioInformado : ""
  );
  if (!usuario) {
    return recusa(400, "SEM_USUARIO", "Funcionário sem CPF cadastrado — informe um usuário");
  }
  if (/^\d+$/.test(usuario)) {
    return recusa(
      400,
      "USUARIO_NUMERICO",
      "Usuário só com números é CPF: cadastre o CPF no funcionário"
    );
  }
  return { ok: true, usuario, tipo: "manual" };
}

// ------------------------------------------------------------------------------------------- leitura

/** Colunas lidas (nunca `select("*")`: as colunas antigas do vínculo saem na 0146). */
export const COLUNAS_CREDENCIAL =
  "id, usuario, tipo, senha_hash, senha_geracao, senha_origem_empresa_id, sessao_versao, tentativas, " +
  "bloqueado_ate, ultimo_sinal_em";
export const COLUNAS_VINCULO =
  "funcionario_id, empresa_id, credencial_id, ativo, sessao_versao, provisoria_hash, provisoria_criada_em, " +
  "provisoria_expira_em, geracao_liberada, confirmado_em, ultimo_acesso";
export const COLUNAS_CADASTRO =
  "id, empresa_id, cpf, ativo, deleted_at, nome_completo, data_admissao";

/** Ids por consulta `in(...)`: o filtro vai na URL do PostgREST, e a lista de uma empresa inteira não cabe numa só. */
export const IDS_POR_LOTE = 100;

/**
 * Lê em lotes de `IDS_POR_LOTE` ids (a lista do `status` do RH tem um vínculo por funcionário da empresa) e junta as
 * linhas. O primeiro erro interrompe e é devolvido (nenhuma lista pela metade vira "não tem").
 */
export async function lerEmLotes<T>(
  ids: string[],
  ler: (lote: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[]; error: unknown }> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const linhas: T[] = [];
  for (let i = 0; i < unicos.length; i += IDS_POR_LOTE) {
    const { data, error } = await ler(unicos.slice(i, i + IDS_POR_LOTE));
    if (error) return { data: [], error };
    linhas.push(...(data ?? []));
  }
  return { data: linhas, error: null };
}

/**
 * Junta cada vínculo ao cadastro dele. O cadastro só vale se for da MESMA empresa do vínculo (vínculo apontando para
 * cadastro de outra empresa fica sem cadastro, ou seja, `cadastro_inativo`).
 */
export function montarItens(
  vinculos: VinculoDoPortal[] | null | undefined,
  cadastros: CadastroDoPortal[] | null | undefined
): ItemDoVinculo[] {
  return (vinculos ?? []).map((vinculo) => ({
    vinculo,
    cadastro:
      (cadastros ?? []).find(
        (c) => c.id === vinculo.funcionario_id && c.empresa_id === vinculo.empresa_id
      ) ?? null,
  }));
}

/**
 * A credencial (pelo usuário do login ou pelo id do token) e todos os vínculos dela, cada um com o cadastro. A
 * credencial nunca é lida em lista: só por um usuário ou por um id. Erro de leitura NÃO vira "não existe": devolve
 * `ok: false` e quem chama responde 503.
 */
export async function lerPessoaDoBanco(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  filtro: { usuario: string } | { id: string }
): Promise<
  { ok: true; credencial: CredencialDoPortal | null; itens: ItemDoVinculo[] } | { ok: false }
> {
  const consulta = supabase.from("portal_credencial").select(COLUNAS_CREDENCIAL);
  const { data: credencial, error } = await (
    "usuario" in filtro ? consulta.eq("usuario", filtro.usuario) : consulta.eq("id", filtro.id)
  ).maybeSingle();
  if (error) {
    console.error("[portal-credencial] credencial:", error.message);
    return { ok: false };
  }
  // As MESMAS três consultas existindo ou não a credencial (ou os vínculos): sem isso, o login de um CPF sem
  // credencial responderia uma ida ao banco mais cedo, e o tempo diria quem tem acesso (R10). O id aleatório não
  // acha nada.
  const { data: vinculos, error: erroVinculos } = await supabase
    .from("funcionario_portal_acesso")
    .select(COLUNAS_VINCULO)
    .eq("credencial_id", credencial?.id ?? crypto.randomUUID());
  if (erroVinculos) {
    console.error("[portal-credencial] vínculos:", erroVinculos.message);
    return { ok: false };
  }
  const ids = credencial ? (vinculos ?? []).map((v: VinculoDoPortal) => v.funcionario_id) : [];
  const { data: cadastros, error: erroCadastros } = await supabase
    .from("funcionario")
    .select(COLUNAS_CADASTRO)
    .in("id", ids.length ? ids : [crypto.randomUUID()]);
  if (erroCadastros) {
    console.error("[portal-credencial] cadastros:", erroCadastros.message);
    return { ok: false };
  }
  if (!credencial) return { ok: true, credencial: null, itens: [] };
  return { ok: true, credencial, itens: ids.length ? montarItens(vinculos, cadastros) : [] };
}

// ----------------------------------------------------------------------------------------- situação (§3.2)

/** O cadastro existe, está ativo e não foi apagado (a mesma regra de `funcionarioPodeEntrar`). */
export function cadastroAtivo(c: CadastroDoPortal | null | undefined): boolean {
  return !!c && c.ativo !== false && !c.deleted_at;
}

/** Há provisória pendente e ela não venceu (sem vencimento = a da cópia da 0145, que continua valendo). */
export function provisoriaValida(v: VinculoDoPortal, agora: number): boolean {
  if (!v.provisoria_hash) return false;
  if (!v.provisoria_expira_em) return true;
  return Date.parse(v.provisoria_expira_em) > agora;
}

/** Credencial de CPF e o CPF do cadastro (só dígitos) é outro. A credencial com letras não depende do CPF. */
export function cpfMudou(
  credencial: CredencialDoPortal | null,
  cadastro: CadastroDoPortal | null
): boolean {
  return (
    !!credencial && credencial.tipo === "cpf" && soDigitos(cadastro?.cpf) !== credencial.usuario
  );
}

export function estaBloqueada(credencial: CredencialDoPortal | null, agora: number): boolean {
  return !!credencial?.bloqueado_ate && Date.parse(credencial.bloqueado_ate) > agora;
}

/**
 * A situação do vínculo, na ordem da tabela da §3.2. `geracao_liberada` nulo nunca é igual à geração; credencial
 * sem senha nunca libera; vínculo sem credencial (linha de antes da cópia da 0145) fica `travado`.
 */
export function situacaoDoVinculo(p: {
  vinculo: VinculoDoPortal;
  cadastro: CadastroDoPortal | null;
  credencial: CredencialDoPortal | null;
  agora: number;
}): Situacao {
  const { vinculo: v, cadastro: c, credencial: cred } = p;
  if (!v.ativo) return "desativado";
  if (!cadastroAtivo(c) || c?.empresa_id !== v.empresa_id) return "cadastro_inativo";
  if (!cred || v.credencial_id !== cred.id) return "travado";
  if (cpfMudou(cred, c)) return "cpf_mudou";
  if (provisoriaValida(v, p.agora)) return "aguardando_provisoria";
  if (cred.senha_hash && v.geracao_liberada !== null && v.geracao_liberada === cred.senha_geracao) {
    return "liberado";
  }
  return "travado";
}

const situacaoDo = (i: ItemDoVinculo, credencial: CredencialDoPortal | null, agora: number) =>
  situacaoDoVinculo({ vinculo: i.vinculo, cadastro: i.cadastro, credencial, agora });

// ------------------------------------------------------------------------------------ login (§5.1)

/**
 * As provisórias que o login confere: de vínculo ativo, cadastro ativo, CPF certo e não vencidas; só as TRÊS mais
 * recentes (`provisoria_criada_em`). A provisória gerada antes da correção do CPF não cria a senha da credencial do
 * CPF errado (revisão 2, m5).
 */
export function provisoriasDoLogin(p: {
  itens: ItemDoVinculo[];
  credencial: CredencialDoPortal | null;
  agora: number;
}): ItemDoVinculo[] {
  const momento = (v: VinculoDoPortal) => {
    const t = v.provisoria_criada_em ? Date.parse(v.provisoria_criada_em) : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  return p.itens
    .filter(
      (i) =>
        i.vinculo.ativo &&
        cadastroAtivo(i.cadastro) &&
        i.cadastro?.empresa_id === i.vinculo.empresa_id &&
        !cpfMudou(p.credencial, i.cadastro) &&
        provisoriaValida(i.vinculo, p.agora)
    )
    .sort((a, b) => momento(b.vinculo) - momento(a.vinculo))
    .slice(0, PROVISORIAS_NO_LOGIN);
}

export type Comparar = (senha: string, hash: string) => Promise<boolean>;

/**
 * Faz SEMPRE as 4 comparações (a pessoal e três provisórias), sem sair antes; o que falta (credencial inexistente,
 * sem senha, menos de três provisórias) é completado com o hash fictício, que nunca conta como acerto. Assim o tempo
 * da resposta não diz se o CPF tem credencial, se ela tem senha nem quantas provisórias há (R10).
 */
export async function conferirLogin(p: {
  senha: string;
  credencial: CredencialDoPortal | null;
  provisorias: ItemDoVinculo[];
  comparar: Comparar;
  hashFicticio: string;
}): Promise<{ pessoal: boolean; provisoria: ItemDoVinculo | null }> {
  const hashPessoal = p.credencial?.senha_hash || null;
  const pessoal = await p.comparar(p.senha, hashPessoal ?? p.hashFicticio);
  let provisoria: ItemDoVinculo | null = null;
  for (let i = 0; i < PROVISORIAS_NO_LOGIN; i++) {
    const candidata = p.provisorias[i];
    const hash = candidata?.vinculo.provisoria_hash || null;
    const confere = await p.comparar(p.senha, hash ?? p.hashFicticio);
    if (confere && hash && candidata && !provisoria) provisoria = candidata;
  }
  return { pessoal: !!hashPessoal && pessoal, provisoria };
}

/**
 * Comparador do login: só hash bcrypt vale. Hash de outro formato (o SHA-256 legado que `verifyPassword` aceita, ou
 * lixo) paga o bcrypt do fictício e responde "não confere": o login gasta sempre o mesmo tempo.
 */
export function criarComparador(
  verificar: (senha: string, hash: string) => Promise<boolean>,
  hashFicticio: string
): Comparar {
  return async (senha, hash) => {
    if (typeof hash === "string" && hash.startsWith("$2")) return await verificar(senha, hash);
    await verificar(senha, hashFicticio);
    return false;
  };
}

export type DecisaoDoLogin =
  | { tipo: "credenciais"; contarFalha: boolean }
  | { tipo: "bloqueado"; ate: string }
  | { tipo: "pedir_provisoria" }
  | { tipo: "cadastro_inativo" }
  | { tipo: "desativado" }
  | { tipo: "entrar"; item: ItemDoVinculo }
  | { tipo: "escolher"; itens: ItemDoVinculo[] }
  | { tipo: "senha_provisoria"; item: ItemDoVinculo };

/**
 * As etapas do login (§5.1), depois das 4 comparações. A etapa `senha_provisoria` é a MESMA com e sem senha na
 * credencial (defesa 2): ela não leva nada da credencial. As recusas depois da senha certa não dizem o nome de
 * nenhuma empresa (R4).
 */
export function decidirLogin(p: {
  credencial: CredencialDoPortal | null;
  conferencia: { pessoal: boolean; provisoria: ItemDoVinculo | null };
  itens: ItemDoVinculo[];
  agora: number;
}): DecisaoDoLogin {
  const cred = p.credencial;
  if (!cred) return { tipo: "credenciais", contarFalha: false };
  const bloqueada = estaBloqueada(cred, p.agora);
  if (p.conferencia.pessoal) {
    if (bloqueada) return { tipo: "bloqueado", ate: cred.bloqueado_ate as string };
    const situacoes = p.itens.map((i) => ({ i, s: situacaoDo(i, cred, p.agora) }));
    const liberados = situacoes.filter((x) => x.s === "liberado").map((x) => x.i);
    if (liberados.length === 1) return { tipo: "entrar", item: liberados[0] };
    if (liberados.length > 1) return { tipo: "escolher", itens: liberados };
    if (situacoes.some((x) => ["travado", "cpf_mudou", "aguardando_provisoria"].includes(x.s))) {
      return { tipo: "pedir_provisoria" };
    }
    if (situacoes.some((x) => x.s === "cadastro_inativo")) return { tipo: "cadastro_inativo" };
    return { tipo: "desativado" };
  }
  if (p.conferencia.provisoria) return { tipo: "senha_provisoria", item: p.conferencia.provisoria };
  return { tipo: "credenciais", contarFalha: !bloqueada };
}

/** A falha de senha conta na credencial: bloqueia na 5ª por 15 min e zera o contador (como antes da T38). */
export function falhaDeLogin(p: { credencial: CredencialDoPortal; agora: number }) {
  const tentativa = (Number(p.credencial.tentativas) || 0) + 1;
  const bloqueou = tentativa >= MAX_FALHAS_LOGIN;
  return {
    tentativa,
    bloqueou,
    tentativas: bloqueou ? 0 : tentativa,
    bloqueado_ate: bloqueou ? iso(p.agora + BLOQUEIO_MIN * 60_000) : null,
  };
}

/** Evento da trilha de uma empresa (o funcionário é o cadastro daquela empresa). */
export interface EventoDaTrilha {
  empresa_id: string;
  funcionario_id: string;
  evento: string;
  detalhe: Record<string, unknown> | null;
}

/** Evento do registro do operador (`portal_credencial_evento`): a empresa do vínculo que agiu, ou null. */
export interface EventoDoOperador {
  empresa_id: string | null;
  evento: string;
  detalhe: Record<string, unknown> | null;
}

export interface Eventos {
  trilha: EventoDaTrilha[];
  operador: EventoDoOperador[];
}

/**
 * Senha errada (defesas 4 e 5): `login_falha` na trilha só dos vínculos LIBERADOS (gravada sem IP e dispositivo:
 * `registrarEvento(..., { semOrigem: true })`) e, no registro do operador, a falha (com IP e dispositivo) e o
 * bloqueio.
 */
export function eventosDaFalhaDeLogin(p: {
  credencial: CredencialDoPortal;
  itens: ItemDoVinculo[];
  agora: number;
  tentativa: number;
  bloqueou: boolean;
}): Eventos {
  const detalhe = { tentativa: p.tentativa, bloqueou: p.bloqueou };
  const trilha = p.itens
    .filter((i) => situacaoDo(i, p.credencial, p.agora) === "liberado")
    .map((i) => ({
      empresa_id: i.vinculo.empresa_id,
      funcionario_id: i.vinculo.funcionario_id,
      evento: "login_falha",
      detalhe: { ...detalhe },
    }));
  const operador: EventoDoOperador[] = [
    { empresa_id: null, evento: OPERADOR_LOGIN_FALHA, detalhe: { ...detalhe } },
  ];
  if (p.bloqueou) {
    operador.push({
      empresa_id: null,
      evento: OPERADOR_CREDENCIAL_BLOQUEADA,
      detalhe: { tentativa: p.tentativa },
    });
  }
  return { trilha, operador };
}

// ------------------------------------------------------------------------------------- sessão (§5.2-5.4)

export interface PayloadDaSessao {
  scope?: unknown;
  credencial_id?: unknown;
  empresa_id?: unknown;
  funcionario_id?: unknown;
  v?: unknown;
  vc?: unknown;
  exp?: unknown;
}

/**
 * A conferência do começo de toda ação com sessão (§5.3): escopo de sessão; a credencial existe e `vc` confere; o
 * vínculo é do funcionário, da credencial e da empresa do token, com `v` igual; o cadastro é da empresa do token; e
 * o vínculo está `liberado`. Token antigo (sem `credencial_id`) cai aqui. Cadastro inativo tem a mensagem própria.
 */
export function sessaoValida(p: {
  payload: PayloadDaSessao | null;
  credencial: CredencialDoPortal | null;
  vinculo: VinculoDoPortal | null;
  cadastro: CadastroDoPortal | null;
  agora: number;
}): { ok: true } | { ok: false; motivo: "sessao" | "cadastro_inativo" } {
  const falha = { ok: false as const, motivo: "sessao" as const };
  const t = p.payload;
  if (!t || t.scope !== ESCOPO_SESSAO) return falha;
  if (typeof t.credencial_id !== "string" || !t.credencial_id) return falha;
  if (typeof t.funcionario_id !== "string" || !t.funcionario_id) return falha;
  if (typeof t.empresa_id !== "string" || !t.empresa_id) return falha;
  const { credencial: cred, vinculo: v, cadastro: c } = p;
  if (!cred || cred.id !== t.credencial_id || cred.sessao_versao !== t.vc) return falha;
  if (
    !v ||
    v.funcionario_id !== t.funcionario_id ||
    v.credencial_id !== t.credencial_id ||
    v.empresa_id !== t.empresa_id ||
    v.sessao_versao !== t.v
  ) {
    return falha;
  }
  if (!c || c.id !== t.funcionario_id || c.empresa_id !== t.empresa_id) return falha;
  const situacao = situacaoDoVinculo({ vinculo: v, cadastro: c, credencial: cred, agora: p.agora });
  if (situacao === "cadastro_inativo") return { ok: false, motivo: "cadastro_inativo" };
  return situacao === "liberado" ? { ok: true } : falha;
}

/**
 * O `funcionario_id` escolhido (escolher_empresa, trocar_empresa) só vale se for de um vínculo LIBERADO da
 * credencial do token. Nenhum outro dado do corpo é usado.
 */
export function vinculoEscolhido(p: {
  itens: ItemDoVinculo[];
  credencial: CredencialDoPortal;
  funcionarioId: unknown;
  agora: number;
}): ItemDoVinculo | null {
  if (typeof p.funcionarioId !== "string" || !p.funcionarioId) return null;
  const achado = p.itens.find(
    (i) =>
      i.vinculo.funcionario_id === p.funcionarioId && i.vinculo.credencial_id === p.credencial.id
  );
  if (!achado) return null;
  return situacaoDo(achado, p.credencial, p.agora) === "liberado" ? achado : null;
}

/** Os vínculos LIBERADOS da credencial em OUTRAS empresas (a lista do "Trocar de empresa"). */
export function outrosVinculosLiberados(p: {
  itens: ItemDoVinculo[];
  credencial: CredencialDoPortal;
  empresaId: string;
  agora: number;
}): ItemDoVinculo[] {
  return p.itens.filter(
    (i) =>
      i.vinculo.empresa_id !== p.empresaId &&
      i.vinculo.credencial_id === p.credencial.id &&
      situacaoDo(i, p.credencial, p.agora) === "liberado"
  );
}

/** Quantas OUTRAS empresas estão liberadas (o "Trocar de empresa"). Nada de contar empresas esperando (defesa 3). */
export function outrasEmpresasLiberadas(p: {
  itens: ItemDoVinculo[];
  credencial: CredencialDoPortal;
  empresaId: string;
  agora: number;
}): number {
  return new Set(outrosVinculosLiberados(p).map((i) => i.vinculo.empresa_id)).size;
}

/** O token da outra empresa vence junto com o de origem: o ttl é o que sobra do token que pediu a troca (§5.4). */
export function ttlDaTroca(p: { expOrigem: unknown; agoraSeg: number }): number {
  const exp = Number(p.expOrigem);
  if (!Number.isFinite(exp)) return 0;
  return Math.max(0, Math.floor(exp - p.agoraSeg));
}

/**
 * O token de ativação ainda vale: escopo próprio, da credencial, do vínculo e da empresa dele, amarrado à
 * provisória (`pc` = `provisoria_criada_em`: uma provisória nova anula o token da anterior) e o vínculo continua
 * esperando a provisória (ativo, cadastro ativo, CPF certo, provisória não vencida).
 */
export function ativacaoValida(p: {
  payload: Record<string, unknown> | null;
  credencial: CredencialDoPortal | null;
  vinculo: VinculoDoPortal | null;
  cadastro: CadastroDoPortal | null;
  agora: number;
}): boolean {
  const t = p.payload;
  const { credencial: cred, vinculo: v, cadastro: c } = p;
  if (!t || t.scope !== ESCOPO_ATIVACAO || !cred || !v || !c) return false;
  if (cred.id !== t.credencial_id || v.credencial_id !== cred.id) return false;
  if (v.funcionario_id !== t.funcionario_id || v.empresa_id !== t.empresa_id) return false;
  if (c.id !== v.funcionario_id) return false;
  if (!v.provisoria_criada_em || v.provisoria_criada_em !== t.pc) return false;
  return (
    situacaoDoVinculo({ vinculo: v, cadastro: c, credencial: cred, agora: p.agora }) ===
    "aguardando_provisoria"
  );
}

// ------------------------------------------------------------------ senha nova, origem e defesa 1 (§4.2-4.3)

/**
 * Defesa 1: credencial SEM senha aceita a primeira senha de qualquer vínculo; credencial COM senha (inclusive o hash
 * inutilizável do procedimento do operador) só cria senha nova pela provisória de um vínculo já CONFIRMADO, isto é,
 * em que alguém já entrou sabendo a senha. O cadastro com CPF alheio nunca soube a senha: não a troca.
 */
export function podeCriarSenhaNova(p: {
  credencial: CredencialDoPortal;
  vinculo: VinculoDoPortal;
}): boolean {
  return !p.credencial.senha_hash || !!p.vinculo.confirmado_em;
}

/**
 * Caso 2 (P10): quem confirma a senha atual numa empresa DIFERENTE da que criou a senha (origem) escolhe uma senha
 * nova, que só ele conhece, antes de liberar: o RH da origem pode conhecer a atual.
 */
export function exigeTrocaNaAtivacao(p: {
  credencial: CredencialDoPortal;
  empresaId: string;
}): boolean {
  const origem = p.credencial.senha_origem_empresa_id;
  return !!origem && origem !== p.empresaId;
}

/**
 * A origem depois de uma troca que informa a senha atual: `trocar_senha` (via "sessao") e a troca da ativação na
 * própria empresa de origem MANTÊM a origem (quem troca ali pode ser quem a criou); só a troca da ativação em outra
 * empresa a zera. Origem nula continua nula. (O procedimento do operador também a zera, mas é SQL: 0145.)
 */
export function origemDepoisDaTroca(p: {
  origem: string | null;
  via: "sessao" | "ativacao";
  empresaId: string;
}): string | null {
  if (!p.origem) return null;
  if (p.via === "ativacao" && p.origem !== p.empresaId) return null;
  return p.origem;
}

/** O vínculo deixa de ter provisória pendente (ela foi usada). */
const PROVISORIA_CONSUMIDA = {
  provisoria_hash: null,
  provisoria_criada_em: null,
  provisoria_expira_em: null,
} as const;

/**
 * `ativar { nova_senha }` (casos 1 e 3): a geração sobe, a origem passa a ser a empresa da provisória, o bloqueio
 * zera e todas as sessões caem (`sessao_versao` da credencial). O vínculo da provisória fica liberado e confirmado;
 * as outras empresas que estavam liberadas TRAVAM (`travadas`, que recebem `acesso_aguardando_provisoria`). O hash da
 * senha nova é do chamador.
 */
export function efeitoDaSenhaNova(p: {
  credencial: CredencialDoPortal;
  item: ItemDoVinculo;
  itens: ItemDoVinculo[];
  agora: number;
}) {
  const geracao = (Number(p.credencial.senha_geracao) || 0) + 1;
  const travadas = p.itens.filter(
    (i) =>
      i.vinculo.funcionario_id !== p.item.vinculo.funcionario_id &&
      situacaoDo(i, p.credencial, p.agora) === "liberado"
  );
  return {
    credencial: {
      senha_geracao: geracao,
      senha_origem_empresa_id: p.item.vinculo.empresa_id,
      tentativas: 0,
      bloqueado_ate: null,
      sessao_versao: p.credencial.sessao_versao + 1,
      senha_alterada_em: iso(p.agora),
    },
    vinculo: {
      geracao_liberada: geracao,
      confirmado_em: p.item.vinculo.confirmado_em ?? iso(p.agora),
      ...PROVISORIA_CONSUMIDA,
      ultimo_acesso: iso(p.agora),
    },
    travadas,
  };
}

/**
 * `ativar { senha_atual }` e `ativar { senha_atual, nova_senha }` (caso 2): libera o vínculo da provisória na geração
 * ATUAL (a senha não foi criada com provisória: as outras empresas continuam liberadas). Com troca: a senha muda (hash
 * do chamador), as sessões de todas as empresas caem e a origem segue `origemDepoisDaTroca`; a geração não sobe.
 */
export function efeitoDaConfirmacao(p: {
  credencial: CredencialDoPortal;
  item: ItemDoVinculo;
  agora: number;
  troca: boolean;
}) {
  const credencial: Record<string, unknown> = { tentativas: 0, bloqueado_ate: null };
  if (p.troca) {
    credencial.sessao_versao = p.credencial.sessao_versao + 1;
    credencial.senha_origem_empresa_id = origemDepoisDaTroca({
      origem: p.credencial.senha_origem_empresa_id,
      via: "ativacao",
      empresaId: p.item.vinculo.empresa_id,
    });
    credencial.senha_alterada_em = iso(p.agora);
  }
  return {
    credencial: credencial as Partial<CredencialDoPortal>,
    vinculo: {
      geracao_liberada: p.credencial.senha_geracao,
      confirmado_em: p.item.vinculo.confirmado_em ?? iso(p.agora),
      ...PROVISORIA_CONSUMIDA,
      ultimo_acesso: iso(p.agora),
    },
  };
}

// ------------------------------------------------------------------------------------------- eventos (§7)

/**
 * Eventos da ativação, em DOIS blocos que o `index.ts` grava em momentos diferentes (revisão 1, I1). A ordem das
 * gravações é: (1) a credencial (senha, geração, sessões); (2) o vínculo da empresa da provisória, que só pega a linha
 * se a provisória ainda é a do token; (3) os eventos.
 * - `daSenha`: o que depende SÓ de a senha ter mudado. Grava logo depois de (1), ainda que (2) falhe: a senha mudou e
 *   as outras empresas travaram de qualquer jeito. É o `acesso_aguardando_provisoria` de cada empresa que travou (sem
 *   dizer qual empresa mexeu) e, no registro do operador, o `senha_criada` (forma `senha_nova`) ou o `troca_senha`
 *   (forma `troca`). Sem isso, o RH de uma empresa confirmada trocaria a senha e travaria as outras sem deixar rastro
 *   no registro em que a defesa 5 e a consulta de alertas se baseiam.
 * - `daLiberacao`: o que depende de o vínculo ter sido liberado. Grava só depois de (2) dar certo. A trilha da empresa
 *   da provisória é IDÊNTICA nas três formas (`login` pela provisória e `acesso_liberado`): ela não pode dizer se a
 *   pessoa já tinha senha nem se a trocou (revisão 3, m4). O `acesso_confirmado` do operador também fica aqui: a
 *   consulta de alertas usa a confirmação para inocentar uma recusa (regra 1), então só vale quando o acesso foi
 *   mesmo confirmado.
 */
export function eventosDaAtivacao(p: {
  forma: "senha_nova" | "senha_atual" | "troca";
  primeira: boolean;
  item: ItemDoVinculo;
  travadas: ItemDoVinculo[];
}): { daSenha: Eventos; daLiberacao: Eventos } {
  const { empresa_id, funcionario_id } = p.item.vinculo;
  const daSenha: Eventos = {
    trilha: p.travadas.map((t) => ({
      empresa_id: t.vinculo.empresa_id,
      funcionario_id: t.vinculo.funcionario_id,
      evento: EVENTO_ACESSO_AGUARDANDO_PROVISORIA,
      detalhe: { motivo: "senha_nova" },
    })),
    operador:
      p.forma === "senha_nova"
        ? [{ empresa_id, evento: OPERADOR_SENHA_CRIADA, detalhe: { primeira: p.primeira } }]
        : p.forma === "troca"
          ? [{ empresa_id, evento: OPERADOR_TROCA_SENHA, detalhe: { via: "ativacao" } }]
          : [],
  };
  const daLiberacao: Eventos = {
    trilha: [
      { empresa_id, funcionario_id, evento: "login", detalhe: { via: "provisoria" } },
      { empresa_id, funcionario_id, evento: EVENTO_ACESSO_LIBERADO, detalhe: null },
    ],
    operador:
      p.forma === "senha_nova"
        ? []
        : [
            {
              empresa_id,
              evento: OPERADOR_ACESSO_CONFIRMADO,
              detalhe: { troca: p.forma === "troca" },
            },
          ],
  };
  return { daSenha, daLiberacao };
}

/** Criar senha nova recusado (defesa 1): só no registro do operador; na trilha contaria que a credencial tem senha. */
export function eventoDoResetRecusado(item: ItemDoVinculo): Eventos {
  return {
    trilha: [],
    operador: [
      { empresa_id: item.vinculo.empresa_id, evento: OPERADOR_RESET_RECUSADO, detalhe: null },
    ],
  };
}

/**
 * Grava no registro do operador (`portal_credencial_evento`, só de inclusão, sem o CPF), com IP e dispositivo.
 * Nunca derruba a ação principal; devolve se gravou.
 */
export async function registrarEventoDaCredencial(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  e: { credencial_id: string } & EventoDoOperador
): Promise<boolean> {
  const { error } = await supabase
    .from("portal_credencial_evento")
    .insert({ ...e, ...origemDaRequisicao(req) });
  if (error) console.error("[portal-credencial] registro do operador:", e.evento, error.message);
  return !error;
}

// ----------------------------------------------------------------------------------------------- RH (§6)

/** A provisória nova do vínculo: criada agora, vence em 7 dias (P3). */
export function provisoriaNova(agora: number) {
  return {
    provisoria_criada_em: iso(agora),
    provisoria_expira_em: iso(agora + VALIDADE_PROVISORIA_DIAS * MS_POR_DIA),
  };
}

/**
 * A resposta do `criar` (e do `redefinir`): as MESMAS chaves, o mesmo status e o mesmo texto, exista ou não
 * credencial daquele CPF em outra empresa. O RH não fica sabendo se a pessoa já usa o portal.
 */
export function respostaDoCriar(p: { usuario: string; senha: string }) {
  return { usuario: p.usuario, senha_provisoria: p.senha, url_path: "/PortalFuncionario" };
}

const dataBr = (d: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

/**
 * Outro cadastro da MESMA pessoa nesta empresa com vínculo ativo (§3.3): se o cadastro dele está ativo, 409
 * `OUTRO_CADASTRO_COM_ACESSO` com o nome e a admissão dele (dado da própria empresa); se está inativo ou apagado, o
 * vínculo velho é desativado (readmissão). Vale ao criar, ao reativar e ao redefinir. `outrosNaEmpresa` são os
 * vínculos da credencial na empresa do RH.
 */
export function conflitoDeOutroCadastro(p: {
  funcionarioId: string;
  outrosNaEmpresa: ItemDoVinculo[];
}): { ok: true; desativar: string[] } | Recusa {
  const outros = p.outrosNaEmpresa.filter(
    (i) => i.vinculo.funcionario_id !== p.funcionarioId && i.vinculo.ativo
  );
  const ativo = outros.find((i) => cadastroAtivo(i.cadastro));
  if (ativo) {
    const nome = (ativo.cadastro?.nome_completo || "").trim() || "outro cadastro";
    const admissao = dataBr(ativo.cadastro?.data_admissao);
    return recusa(
      409,
      "OUTRO_CADASTRO_COM_ACESSO",
      `Esta pessoa já tem acesso ao portal por outro cadastro nesta empresa: ${nome}` +
        (admissao ? `, admitido em ${admissao}` : "") +
        ". Desative o acesso daquele cadastro antes."
    );
  }
  return { ok: true, desativar: outros.map((i) => i.vinculo.funcionario_id) };
}

/**
 * O `criar` do RH (§3.3 e §6). Usuário com letras já usado: 409 `USUARIO_EM_USO` (não envolve CPF). CPF que coincide
 * com um usuário com letras legado (11 dígitos, de antes da T38): conflito, sem repetir o CPF (a conferência da 0145
 * lista esses casos antes). CPF com credencial: o vínculo novo LIGA a ela, de qualquer empresa. Depois, a regra do
 * outro cadastro na mesma empresa.
 *
 * Credencial ÓRFÃ (`orfa`: nenhum vínculo e sem senha) é a que um `criar` anterior criou e cujo vínculo falhou ao
 * gravar (as funções não apagam linha alguma): não é de ninguém, então é reaproveitada, inclusive a de usuário com
 * letras (sem isso, repetir o mesmo usuário daria USUARIO_EM_USO).
 */
export function decidirCriarVinculo(p: {
  funcionarioId: string;
  usuario: { usuario: string; tipo: TipoCredencial };
  credencialExistente: { id: string; tipo: TipoCredencial; orfa?: boolean } | null;
  outrosNaEmpresa: ItemDoVinculo[];
}): { ok: true; credencial: "nova" | "existente"; desativar: string[] } | Recusa {
  const existe = p.credencialExistente;
  if (existe?.orfa && existe.tipo === p.usuario.tipo) {
    return { ok: true, credencial: "existente", desativar: [] };
  }
  if (existe && p.usuario.tipo === "manual") {
    return recusa(
      409,
      "USUARIO_EM_USO",
      "Este usuário já existe no portal. Escolha outro, por exemplo joao.silva2"
    );
  }
  if (existe && existe.tipo !== "cpf") {
    return recusa(
      409,
      "CPF_EM_CONFLITO",
      "Não foi possível criar o acesso com este CPF. Fale com o suporte do SIGO."
    );
  }
  const outro = conflitoDeOutroCadastro({
    funcionarioId: p.funcionarioId,
    outrosNaEmpresa: p.outrosNaEmpresa,
  });
  if (!outro.ok) return outro;
  return { ok: true, credencial: existe ? "existente" : "nova", desativar: outro.desativar };
}

/**
 * Para qual credencial o `redefinir` gera a provisória. Mesma credencial, ou RELIGAR (caso 7) quando o CPF do
 * cadastro mudou, quando o cadastro sem CPF ganhou um (R9: o usuário com letras passa para o CPF) e quando o vínculo
 * ainda não tem credencial (linha criada pela versão antiga antes da 0146).
 */
export function alvoDaRedefinicao(p: {
  cadastro: CadastroDoPortal;
  credencialAtual: CredencialDoPortal | null;
}):
  | { ok: true; religar: false }
  | { ok: true; religar: true; usuario: string; tipo: "cpf" }
  | Recusa {
  const digitos = soDigitos(p.cadastro.cpf);
  if (digitos) {
    if (!cpfValido(p.cadastro.cpf)) {
      return recusa(
        400,
        "CPF_INVALIDO",
        "CPF do funcionário inválido (confira os dígitos no cadastro). Corrija o cadastro para gerar a senha provisória."
      );
    }
    if (p.credencialAtual?.tipo === "cpf" && p.credencialAtual.usuario === digitos) {
      return { ok: true, religar: false };
    }
    return { ok: true, religar: true, usuario: digitos, tipo: "cpf" };
  }
  if (p.credencialAtual?.tipo === "manual") return { ok: true, religar: false };
  return recusa(
    409,
    "SEM_CPF",
    "O cadastro do funcionário está sem CPF: cadastre o CPF para gerar a senha provisória."
  );
}

/**
 * `redefinir` no vínculo (§6): provisória nova (7 dias), tira a liberação (a senha atual deixa de abrir esta
 * empresa), reativa e derruba as sessões desta empresa. NÃO mexe no bloqueio (é da credencial: o RH de uma empresa
 * não desbloqueia a pessoa nas outras), na senha pessoal, na geração nem no `confirmado_em`. Religar (caso 7) é
 * vínculo novo: a confirmação era da outra credencial.
 */
export function efeitoDaRedefinicao(p: {
  vinculo: VinculoDoPortal;
  provisoriaHash: string;
  agora: number;
  religarPara: string | null;
}): Record<string, unknown> {
  return {
    provisoria_hash: p.provisoriaHash,
    ...provisoriaNova(p.agora),
    geracao_liberada: null,
    ativo: true,
    sessao_versao: p.vinculo.sessao_versao + 1,
    ...(p.religarPara ? { credencial_id: p.religarPara, confirmado_em: null } : {}),
  };
}

/**
 * Uma linha do `status` (a Ficha e a lista do RH): situação do vínculo, o usuário da credencial, o último acesso
 * NESTA empresa e o "Bloqueado" da credencial só em vínculo liberado (defesa 4). `primeiro_acesso_pendente` continua
 * (a T37 e o aviso de atraso usam). Nada aqui diz se a provisória pode ou não criar senha nova.
 */
export function statusDoVinculo(p: {
  vinculo: VinculoDoPortal;
  credencial: CredencialDoPortal | null;
  cadastro: CadastroDoPortal | null;
  agora: number;
}) {
  const situacao = situacaoDoVinculo(p);
  return {
    funcionario_id: p.vinculo.funcionario_id,
    usuario: p.credencial?.usuario ?? null,
    ativo: p.vinculo.ativo,
    situacao,
    primeiro_acesso_pendente: situacao === "aguardando_provisoria",
    precisa_provisoria: situacao === "travado" || situacao === "cpf_mudou",
    bloqueado: situacao === "liberado" && estaBloqueada(p.credencial, p.agora),
    ultimo_acesso: p.vinculo.ultimo_acesso ?? null,
  };
}
