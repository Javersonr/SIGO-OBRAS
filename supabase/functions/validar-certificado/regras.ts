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
 *    (`MOLDE_ORDEM_ANTIGA`, igual ao código de emissão desde o 1º certificado). Se nem assim bater,
 *    o resultado é "não verificável" (`integro: null`): jamais reprovamos um certificado real por uma
 *    forma antiga que não conhecemos.
 */
import {
  HASH_VERSAO_CANONICO,
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
  /** true = confere; false = não confere (versão 2); null = forma antiga que não dá para reconferir */
  integro: boolean | null;
  hash_versao: 1 | 2;
}

export interface AvaliacaoCertificado extends Integridade {
  situacao: SituacaoCertificado;
  /** autêntico (íntegro ou não verificável), não revogado e dentro da validade */
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
 * A versão vem da assinatura (`hash_versao`); sem ela, é o hash antigo.
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

  if (versaoGravada >= HASH_VERSAO_CANONICO) {
    const refeito = await hashDoCertificado(cert.codigo, cert.dados, cert.assinatura_aluno);
    return { integro: refeito === gravado, hash_versao: 2 };
  }

  // Antigo: o JSON.stringify da emissão, com as chaves de volta na ordem original.
  const original = naOrdemDoMolde(
    { codigo: cert.codigo, dados: cert.dados, assinatura: cert.assinatura_aluno },
    MOLDE_ORDEM_ANTIGA
  );
  const refeito = await sha256Hex(JSON.stringify(original));
  return { integro: refeito === gravado ? true : null, hash_versao: 1 };
}

// ------------------------------------------------------------------------------ validade

/** Data de calendário (AAAA-MM-DD) em Brasília no instante `agora`. */
export function dataDeBrasilia(agora: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}`;
}

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

// ------------------------------------------------------------------------------ situação

/** Prioridade: revogado, depois dados que não conferem, depois vencido. `integro: null` não reprova. */
export function situacaoDoCertificado(s: {
  revogado: boolean;
  integro: boolean | null;
  vencido: boolean;
}): SituacaoCertificado {
  if (s.revogado) return "revogado";
  if (s.integro === false) return "divergente";
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
