/**
 * Regras da validação PÚBLICA do certificado EAD (módulo puro: sem Deno.*, sem rede, sem banco).
 * O `index.ts` só lê a linha do banco e chama `avaliarCertificado`.
 *
 * Três perguntas, nesta ordem de gravidade:
 *  1. Revogado? (a empresa cancelou o certificado)
 *  2. Íntegro? O hash gravado na emissão bate com o que está no banco hoje? (se não, alguém mexeu em
 *     `dados`, na assinatura ou no código depois da emissão)
 *  3. Vencido? A validade (`dados.periodo.validade`) é anterior à data de HOJE em Brasília.
 *
 * Duas versões de hash convivem, porque já pode haver certificado emitido com a antiga:
 *  - versão 2 (T10): SHA-256 do JSON canônico de `{ codigo, dados, assinatura }`; a assinatura leva
 *    `hash_versao: 2`. Reproduzível a partir do banco, na ordem de chaves que o `jsonb` devolver.
 *  - versão 1 (antiga, sem `hash_versao`): SHA-256 do `JSON.stringify` na ordem em que o servidor
 *    montava os objetos. O `jsonb` reordena as chaves, então só dá para refazer reaplicando essa ordem
 *    (`MOLDE_ORDEM_ANTIGA`, igual ao código de emissão desde o 1º certificado).
 *
 * A versão vem de um campo gravado na própria linha (`assinatura_aluno.hash_versao`), então quem
 * alterasse o registro poderia apagá-lo para cair numa forma mais frouxa. Por isso, SEM `hash_versao`
 * tenta-se a v1 e, se ela não bater, a v2; se nenhuma reproduzir o hash gravado, o registro NÃO confere
 * (`integro: false`). Nunca existe "não verificável": o resultado é `true` ou `false`. Com a v2 gravada,
 * só a v2 vale (a v1 nunca é tentada).
 */
import {
  HASH_VERSAO_CANONICO,
  dataBrasilia,
  hashDoCertificado,
  sha256Hex,
} from "../_shared/portal-funcionario.ts";

export type SituacaoCertificado = "valido" | "vencido" | "revogado" | "divergente";

export interface CertificadoGravado {
  codigo: string;
  dados: unknown;
  assinatura_aluno: unknown;
  hash_sha256: string;
  revogado_em?: string | null;
}

export interface Integridade {
  /** true = o hash gravado se reproduz a partir do banco; false = não se reproduz (nunca null) */
  integro: boolean;
  /** versão do hash que reproduziu; se nenhuma reproduziu, a que o registro declara (sem campo: 1) */
  hash_versao: 1 | 2;
}

export interface AvaliacaoCertificado extends Integridade {
  situacao: SituacaoCertificado;
  /** autêntico (íntegro), não revogado e dentro da validade */
  valido: boolean;
  revogado: boolean;
  vencido: boolean;
  /** AAAA-MM-DD ou null (curso sem renovação) */
  validade: string | null;
}

// ------------------------------------------------------------------------------ integridade

/**
 * Ordem das chaves como o servidor montava `{ codigo, dados, assinatura }` antes da T10 (a emissão não
 * mudou desde o primeiro certificado). Os valores são só marcadores: vale a ordem dos nomes. Em listas,
 * o molde é o do item.
 */
const MOLDE_ORDEM_ANTIGA = {
  codigo: 0,
  dados: {
    aluno: { nome: 0, cpf: 0, funcao: 0 },
    empresa: { nome: 0, cnpj: 0 },
    curso: {
      nome: 0,
      codigo: 0,
      carga_horaria_horas: 0,
      modalidade: 0,
      conteudo_programatico: 0,
      aulas: [{ modulo: 0, titulo: 0 }],
    },
    periodo: { inicio: 0, conclusao: 0, validade: 0 },
    avaliacao: { nota: 0, tentativa: 0 },
    instrutor: { nome: 0, qualificacao: 0 },
    responsavel_tecnico: { nome: 0, registro: 0 },
  },
  assinatura: { metodo: 0, usuario: 0, declaracao: 0, assinado_em: 0, ip: 0, dispositivo: 0 },
};

/** Reaplica a ordem do molde; chave fora do molde vai para o fim, na ordem em que veio. */
function naOrdemDoMolde(valor: unknown, molde: unknown): unknown {
  if (Array.isArray(valor)) {
    const item = Array.isArray(molde) ? molde[0] : undefined;
    return valor.map((v) => naOrdemDoMolde(v, item));
  }
  if (valor !== null && typeof valor === "object") {
    const origem = valor as Record<string, unknown>;
    const m =
      molde !== null && typeof molde === "object" && !Array.isArray(molde)
        ? (molde as Record<string, unknown>)
        : {};
    const saida: Record<string, unknown> = {};
    for (const k of Object.keys(m)) if (k in origem) saida[k] = naOrdemDoMolde(origem[k], m[k]);
    for (const k of Object.keys(origem))
      if (!(k in saida)) saida[k] = naOrdemDoMolde(origem[k], undefined);
    return saida;
  }
  return valor;
}

const minusculo = (h: unknown) =>
  String(h ?? "")
    .trim()
    .toLowerCase();

/**
 * Refaz o hash a partir do que está gravado e compara com o `hash_sha256` da emissão.
 * Com `hash_versao` >= 2 na assinatura, só a v2 vale. Sem ela: tenta a v1 (hash antigo) e, se não
 * bater, a v2; se nenhuma bater, `integro = false` (T10, M1: apagar a versão não rebaixa a conferência).
 */
export async function conferirIntegridade(cert: {
  codigo: string;
  dados: unknown;
  assinatura_aluno: unknown;
  hash_sha256: string;
}): Promise<Integridade> {
  const gravado = minusculo(cert.hash_sha256);
  const versaoGravada = Number(
    (cert.assinatura_aluno as { hash_versao?: unknown } | null)?.hash_versao
  );

  const confereV2 = async () =>
    (await hashDoCertificado(cert.codigo, cert.dados, cert.assinatura_aluno)) === gravado;

  if (versaoGravada >= HASH_VERSAO_CANONICO) {
    return { integro: await confereV2(), hash_versao: 2 };
  }

  // Sem versão: o JSON.stringify da emissão antiga, com as chaves de volta na ordem original...
  const original = naOrdemDoMolde(
    { codigo: cert.codigo, dados: cert.dados, assinatura: cert.assinatura_aluno },
    MOLDE_ORDEM_ANTIGA
  );
  if ((await sha256Hex(JSON.stringify(original))) === gravado) {
    return { integro: true, hash_versao: 1 };
  }
  // ...e, se não bateu, o hash canônico (a versão pode ter sido apagada do registro)
  if (await confereV2()) return { integro: true, hash_versao: 2 };
  return { integro: false, hash_versao: 1 };
}

// ------------------------------------------------------------------------------ validade

/** Data de calendário (AAAA-MM-DD) em Brasília no instante `agora` (a mesma do portal-funcionario, T8). */
export const dataDeBrasilia = dataBrasilia;

/** AAAA-MM-DD de uma validade (aceita timestamp: só o dia vale) ou null se não for data. */
function diaDaValidade(validade: unknown): string | null {
  const m = typeof validade === "string" ? /^(\d{4}-\d{2}-\d{2})/.exec(validade.trim()) : null;
  return m ? m[1] : null;
}

/** Validade gravada no certificado (`dados.periodo.validade`) ou null. */
export function validadeDoCertificado(dados: unknown): string | null {
  return diaDaValidade((dados as { periodo?: { validade?: unknown } } | null)?.periodo?.validade);
}

/**
 * Vencido = validade ANTERIOR ao dia de hoje (Brasília): no último dia o certificado ainda vale.
 * Sem validade, ou valor que não seja data, não vence.
 */
export function estaVencido(validade: unknown, hoje: string): boolean {
  const dia = diaDaValidade(validade);
  return dia !== null && dia < hoje;
}

// ------------------------------------------------------------------------------ local

/**
 * Onde o treinamento foi realizado (`dados.local`, gravado desde a T8): só o ambiente sai na consulta
 * pública. Certificado anterior à T8 não tem local: devolve null e a página não mostra a linha.
 */
export function localDoCertificado(dados: unknown): { ambiente: string } | null {
  const local = (dados as { local?: unknown } | null)?.local;
  const ambiente = (local as { ambiente?: unknown } | null | undefined)?.ambiente;
  return typeof ambiente === "string" && ambiente.trim() ? { ambiente } : null;
}

// ------------------------------------------------------------------------------ responsável técnico

/**
 * Responsável técnico na consulta pública (`dados.responsavel_tecnico`): só nome e registro. O objeto
 * gravado pode levar `assinatura_ref` (T29, a imagem da assinatura), que é um caminho do Storage com o
 * id da empresa e não pode sair numa consulta pública. Sem nome (ou sem o objeto, como nos certificados
 * mais antigos) devolve null e a página não mostra a linha.
 */
export function responsavelTecnicoPublico(
  dados: unknown
): { nome: string; registro: string | null } | null {
  const rt = (dados as { responsavel_tecnico?: unknown } | null)?.responsavel_tecnico;
  if (rt === null || typeof rt !== "object" || Array.isArray(rt)) return null;
  const { nome, registro } = rt as { nome?: unknown; registro?: unknown };
  if (typeof nome !== "string" || !nome.trim()) return null;
  return { nome, registro: typeof registro === "string" && registro.trim() ? registro : null };
}

// ------------------------------------------------------------------------------ tipo do treinamento

/** Limites do motivo do treinamento eventual (os mesmos do CHECK da migração 0142 e de tipo-treinamento.ts). */
const MOTIVO_EVENTUAL_MIN = 3;
const MOTIVO_EVENTUAL_MAX = 200;

/**
 * Tipo do treinamento na consulta pública (NR-1 1.7.1.2): `dados.tipo_treinamento` (inicial, periódico ou
 * eventual) e, só no eventual, `dados.motivo_eventual`, gravados na emissão desde a T23. Certificado emitido antes
 * (sem a chave), valor desconhecido ou eventual sem motivo válido (3 a 200 caracteres) devolvem null e a página
 * não mostra a linha: a consulta pública nunca afirma um tipo que o servidor não congelou. Inicial e periódico
 * nunca levam motivo. A regra é a de `dadosDoTipoNoCertificado`, do portal-funcionario (conferida no teste); esta
 * cópia existe porque uma função não importa o código da outra na hora de publicar.
 */
export function tipoDoTreinamentoPublico(dados: unknown): {
  tipo_treinamento: "inicial" | "periodico" | "eventual";
  motivo_eventual: string | null;
} | null {
  if (dados === null || typeof dados !== "object" || Array.isArray(dados)) return null;
  const { tipo_treinamento: tipo, motivo_eventual: motivo } = dados as {
    tipo_treinamento?: unknown;
    motivo_eventual?: unknown;
  };
  if (tipo === "inicial" || tipo === "periodico") {
    return { tipo_treinamento: tipo, motivo_eventual: null };
  }
  if (tipo !== "eventual") return null;
  const texto = typeof motivo === "string" ? motivo.trim() : "";
  if (texto.length < MOTIVO_EVENTUAL_MIN || texto.length > MOTIVO_EVENTUAL_MAX) return null;
  return { tipo_treinamento: "eventual", motivo_eventual: texto };
}

// ------------------------------------------------------------------------------ situação

/**
 * Prioridade: revogado, depois dados que não conferem, depois vencido. Falha fechado: só `integro === true`
 * é autêntico (`false`, `null` ou ausente viram "divergente").
 */
export function situacaoDoCertificado(s: {
  revogado: boolean;
  integro: boolean;
  vencido: boolean;
}): SituacaoCertificado {
  if (s.revogado) return "revogado";
  if (s.integro !== true) return "divergente";
  if (s.vencido) return "vencido";
  return "valido";
}

export async function avaliarCertificado(
  cert: CertificadoGravado,
  agora: Date
): Promise<AvaliacaoCertificado> {
  const integridade = await conferirIntegridade(cert);
  const revogado = !!cert.revogado_em;
  const validade = validadeDoCertificado(cert.dados);
  const vencido = estaVencido(validade, dataDeBrasilia(agora));
  const situacao = situacaoDoCertificado({ revogado, integro: integridade.integro, vencido });
  return {
    situacao,
    valido: situacao === "valido",
    revogado,
    vencido,
    integro: integridade.integro,
    hash_versao: integridade.hash_versao,
    validade,
  };
}

// ------------------------------------------------------------------------------ leitura

export type ResultadoDaConsulta<T> =
  | { tipo: "erro" }
  | { tipo: "nao_encontrado" }
  | { tipo: "encontrado"; certificado: T };

/**
 * O que a leitura do certificado (`maybeSingle` do supabase-js) quer dizer. `error` vence tudo: se o banco
 * falhou, a resposta é erro (500) e não "nenhum certificado com esse código", que um fiscal leria como
 * certificado falso (T10, M7). Sem erro: linha = encontrado; sem linha = não encontrado.
 */
export function resultadoDaConsulta<T>(leitura: {
  data?: T | null;
  error?: unknown;
}): ResultadoDaConsulta<T> {
  if (leitura.error) return { tipo: "erro" };
  if (!leitura.data) return { tipo: "nao_encontrado" };
  return { tipo: "encontrado", certificado: leitura.data };
}
