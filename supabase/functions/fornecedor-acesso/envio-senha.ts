/**
 * Envio da senha do Portal do Fornecedor pelo WhatsApp do SIGO (ação `enviar_senha` do `fornecedor-acesso`).
 *
 * Decisão do dono (24/11): a senha do fornecedor NÃO passa mais pela tela. O servidor gera a senha, manda a
 * mensagem direto ao telefone do cadastro pelo canal do SaaS (Evolution, o mesmo do `enviar-whatsapp`) e só
 * DEPOIS de o envio ser aceito grava o hash. O link da cotação continua saindo pelo WhatsApp do comprador.
 *
 * Módulo puro: banco, canal, gerador de senha e hash são injetados (`DepsDoEnvio`); o `index.ts` só os liga.
 * Teste: `envio-senha.test.ts`, ao lado.
 *
 * Ordem (cada passo só roda se o anterior passou):
 *   1. fornecedor da empresa; login = e-mail normalizado (sem e-mail → SEM_EMAIL);
 *   2. telefone do cadastro normalizado (inválido → SEM_TELEFONE);
 *   3. freio do canal (o MESMO limite do `enviar-whatsapp`: o número é um só para todas as empresas);
 *      estourou → LIMITE; limitador fora do ar NEGA → CANAL_INDISPONIVEL;
 *   4. auditoria `iniciado` (sem ela nada acontece → SEM_RASTRO);
 *   5. gera a senha e ENVIA; falhou → auditoria `erro`, NADA é trocado (a senha antiga continua valendo):
 *      CANAL_INDISPONIVEL (canal não configurado) ou FALHA_NO_ENVIO;
 *   6. grava o hash em todas as linhas ativas (cria a primeira se não houver); falhou → auditoria `erro`,
 *      FALHA_AO_GRAVAR (a senha que chegou pode não valer: enviar de novo);
 *   7. auditoria `sucesso` com o destino MASCARADO.
 * A resposta nunca leva a senha, o hash nem o número inteiro.
 */
import { normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";
import {
  camposDaTroca,
  decidirCredencial,
  MENSAGEM_SEM_EMAIL,
  MENSAGEM_SEM_RASTRO,
  passosDaCredencial,
  registroDaCredencial,
} from "./regras.ts";

// ---------------------------------------------------------------- freio (o mesmo do enviar-whatsapp)

/**
 * Chaves e tetos do freio do canal: IGUAIS aos do `enviar-whatsapp/index.ts` (escopo, janela, `usuario:<e-mail>`
 * e `empresa:<id>`), para os dois somarem no MESMO limite por usuário e por empresa. Um teste confere com o
 * arquivo irmão; se mudar lá, mude aqui.
 */
export const FREIO_WHATSAPP = {
  escopo: "enviar-whatsapp",
  janelaSeg: 60 * 60,
  maxPorUsuario: 60,
  maxPorEmpresa: 300,
} as const;

export function limitesDoFreio(chamadorEmail: string, empresaId: string | null) {
  return [
    {
      tipo: "conta" as const,
      valor: `usuario:${chamadorEmail}`,
      max: FREIO_WHATSAPP.maxPorUsuario,
    },
    {
      tipo: "conta" as const,
      valor: empresaId ? `empresa:${empresaId}` : null,
      max: FREIO_WHATSAPP.maxPorEmpresa,
    },
  ];
}

/** 5511999990000 → 5511*****0000 (o mesmo formato do `enviar-whatsapp`; nunca o número inteiro). */
export function mascararNumero(n: string): string {
  return n.length > 8 ? n.slice(0, 4) + "*".repeat(n.length - 8) + n.slice(-4) : "****";
}

// ---------------------------------------------------------------- texto da mensagem

/**
 * Texto que o fornecedor recebe do número do SIGO. Curto, sem markdown além do negrito do WhatsApp (*...*).
 * Leva a senha: só sai daqui para o canal, nunca para log, auditoria ou resposta.
 */
/** Tamanho máximo dos nomes (fornecedor, empresa) dentro da mensagem. */
export const MAX_NOME_NA_MENSAGEM = 80;

/**
 * Nome vindo do cadastro, limpo para entrar na mensagem (2ª revisão do 2b-2): sem quebras de linha nem
 * caracteres de controle (viram espaço), sem o `*` do negrito do WhatsApp, espaços juntados e cortado em
 * `MAX_NOME_NA_MENSAGEM` caracteres.
 */
export function limparNome(v: unknown, max: number = MAX_NOME_NA_MENSAGEM): string {
  const limpo = String(v ?? "")
    // controles (0-31, 127-159), separadores de linha/parágrafo (U+2028/2029) e o * viram espaço
    .split("")
    .map((c) => {
      const n = c.charCodeAt(0);
      return n < 32 || (n >= 127 && n <= 159) || n === 0x2028 || n === 0x2029 || c === "*"
        ? " "
        : c;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(limpo).slice(0, max).join("").trim();
}

export function textoDaSenha(p: {
  empresa: string;
  fornecedor: string;
  enderecoLogin: string;
  login: string;
  senha: string;
}): string {
  const empresa = limparNome(p.empresa) || "a empresa";
  const fornecedor = limparNome(p.fornecedor) || "fornecedor";
  return [
    `Olá, ${fornecedor}!`,
    "",
    `Este é o seu acesso ao Portal do Fornecedor de *${empresa}* (cotações):`,
    `Endereço: ${p.enderecoLogin}`,
    `Login: ${p.login}`,
    `Senha: ${p.senha}`,
    "",
    "Esta senha substitui qualquer senha anterior do portal.",
    "",
    `Mensagem automática do SIGO Obras. Este número não recebe respostas; dúvidas, fale com o comprador de ${empresa}.`,
  ].join("\n");
}

/** Endereço da tela de login do portal do fornecedor, na mesma base pública dos links (`baseDoLink`). */
export function enderecoDoLoginDoPortal(base: string): string {
  return `${base}/FornecedorLogin`;
}

// ---------------------------------------------------------------- resultado

export type MotivoDoEnvio =
  | "SEM_EMAIL"
  | "SEM_TELEFONE"
  | "LIMITE"
  | "CANAL_INDISPONIVEL"
  | "SEM_RASTRO"
  | "FALHA_NO_ENVIO"
  | "FALHA_AO_GRAVAR";

export const MENSAGENS_DO_MOTIVO: Record<MotivoDoEnvio, string> = {
  SEM_EMAIL: MENSAGEM_SEM_EMAIL,
  SEM_TELEFONE:
    "O fornecedor não tem telefone válido no cadastro (DDD + número): a senha não foi enviada.",
  LIMITE:
    "Limite de mensagens automáticas por hora atingido. Aguarde um pouco e envie a senha pelo Painel de Status.",
  CANAL_INDISPONIVEL:
    "O WhatsApp do SIGO está fora do ar no momento: a senha não foi enviada e a anterior continua valendo.",
  SEM_RASTRO: MENSAGEM_SEM_RASTRO,
  FALHA_NO_ENVIO:
    "Não deu para enviar a senha pelo WhatsApp do SIGO: nada foi trocado e a senha anterior continua valendo.",
  FALHA_AO_GRAVAR:
    "A mensagem com a senha saiu, mas a senha não foi gravada: ela pode não valer. Envie uma senha nova pelo Painel de Status.",
};

export type ResultadoDoEnvio =
  | { tipo: "nao_encontrado" }
  | { tipo: "ok"; corpo: { enviado: true; destino: string; login: string } }
  | { tipo: "ok"; corpo: { enviado: false; motivo: MotivoDoEnvio; mensagem: string } };

const naoEnviado = (motivo: MotivoDoEnvio): ResultadoDoEnvio => ({
  tipo: "ok",
  corpo: { enviado: false, motivo, mensagem: MENSAGENS_DO_MOTIVO[motivo] },
});

// ---------------------------------------------------------------- o fluxo

export interface DepsDoEnvio {
  fornecedor(): Promise<{
    id: string;
    nome_razao?: string | null;
    email?: string | null;
    telefone?: string | null;
  } | null>;
  acessosAtivos(): Promise<{ id: string; fornecedor_email?: string | null }[]>;
  nomeDaEmpresa(): Promise<string>;
  consumirFreio(
    limites: ReturnType<typeof limitesDoFreio>
  ): Promise<{ permitido: boolean; indisponivel?: boolean }>;
  /** grava uma linha na auditoria; devolve a mensagem de erro ou null */
  auditar(linha: Record<string, unknown>): Promise<string | null>;
  gerarSenha(): string;
  /** envia pelo canal; lança se falhar */
  enviar(numero: string, texto: string): Promise<void>;
  canalNaoConfigurado(e: unknown): boolean;
  hash(senha: string): Promise<string>;
  novoId(): string;
  criarAcesso(
    id: string,
    campos: { senha_acesso: string; fornecedor_email: string }
  ): Promise<string | null>;
  trocarTodas(campos: {
    senha_acesso: string;
    fornecedor_email: string;
  }): Promise<{ erro: string | null; trocados: number }>;
}

export interface EntradaDoEnvio {
  empresaId: string;
  chamadorEmail: string;
  fornecedorId: string;
  base: string;
  ip?: string | null;
  userAgent?: string | null;
}

export async function enviarSenhaDoFornecedor(
  deps: DepsDoEnvio,
  e: EntradaDoEnvio
): Promise<ResultadoDoEnvio> {
  // 1. fornecedor e login
  const fornecedor = await deps.fornecedor();
  if (!fornecedor) return { tipo: "nao_encontrado" };
  const decisao = decidirCredencial({
    acessosAtivos: await deps.acessosAtivos(),
    emailDoCadastro: fornecedor.email,
  });
  if (decisao.tipo === "sem_email") return naoEnviado("SEM_EMAIL");

  // 2. telefone (o mesmo campo do wa.me da tela)
  const numero = normalizarTelefoneBR(String(fornecedor.telefone ?? ""));
  if (!numero) return naoEnviado("SEM_TELEFONE");
  const destino = mascararNumero(numero);

  // 3. freio do canal
  const freio = await deps.consumirFreio(limitesDoFreio(e.chamadorEmail, e.empresaId));
  if (!freio.permitido) return naoEnviado(freio.indisponivel ? "CANAL_INDISPONIVEL" : "LIMITE");

  // 4. rastro primeiro
  const acessoNovo = decisao.tipo === "criar";
  const acessoId = decisao.tipo === "rotacionar" ? decisao.acessoId : deps.novoId();
  const dados = {
    empresaId: e.empresaId,
    chamadorEmail: e.chamadorEmail,
    ip: e.ip ?? null,
    userAgent: e.userAgent ?? null,
    fornecedorId: fornecedor.id,
    fornecedorNome: fornecedor.nome_razao,
    acessoId,
    acessoNovo,
    destino,
  };
  if (await deps.auditar(registroDaCredencial({ ...dados, status: "iniciado" }))) {
    return naoEnviado("SEM_RASTRO");
  }

  // 5. gera e ENVIA antes de gravar: se o envio falhar, nada é trocado
  const senha = deps.gerarSenha();
  const texto = textoDaSenha({
    empresa: await deps.nomeDaEmpresa(),
    fornecedor: fornecedor.nome_razao || "",
    enderecoLogin: enderecoDoLoginDoPortal(e.base),
    login: decisao.email,
    senha,
  });
  try {
    await deps.enviar(numero, texto);
  } catch (erro) {
    const indisponivel = deps.canalNaoConfigurado(erro);
    // no registro só o tipo da falha (o corpo da Evolution pode ecoar o texto, que tem a senha)
    const msg = String((erro as Error)?.message ?? "");
    await deps.auditar(
      registroDaCredencial({
        ...dados,
        status: "erro",
        etapa: "envio",
        erro: indisponivel
          ? "canal não configurado"
          : (msg.match(/^Evolution \d+/)?.[0] ?? "falha no envio"),
      })
    );
    return naoEnviado(indisponivel ? "CANAL_INDISPONIVEL" : "FALHA_NO_ENVIO");
  }

  // 6. envio aceito: grava o hash em todas as linhas ativas (criando a primeira se não houver)
  let campos = { senha_acesso: "", fornecedor_email: decisao.email };
  let erroGravar: string | null = null;
  let trocados = 0;
  try {
    campos = camposDaTroca(await deps.hash(senha), decisao.email);
  } catch {
    erroGravar = "falha ao calcular o hash";
  }
  for (const passo of erroGravar ? [] : passosDaCredencial(decisao)) {
    if (passo === "criar") {
      erroGravar = await deps.criarAcesso(acessoId, campos);
    } else {
      const r = await deps.trocarTodas(campos);
      erroGravar = r.erro ?? (r.trocados ? null : "nenhum acesso ativo encontrado ao gravar");
      trocados = r.trocados;
    }
    if (erroGravar) break;
  }
  if (erroGravar) {
    await deps.auditar(
      registroDaCredencial({ ...dados, status: "erro", etapa: "gravacao", erro: erroGravar })
    );
    return naoEnviado("FALHA_AO_GRAVAR");
  }

  // 7. sucesso (destino mascarado; nunca o texto nem a senha)
  await deps.auditar(
    registroDaCredencial({ ...dados, status: "sucesso", acessosTrocados: trocados })
  );
  return { tipo: "ok", corpo: { enviado: true, destino, login: campos.fornecedor_email } };
}
