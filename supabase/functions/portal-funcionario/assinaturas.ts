/**
 * Assinaturas (imagem) do instrutor e do responsável técnico no certificado EAD (T29): módulo PURO.
 *
 * Sem `Deno.*`, sem import de URL e sem banco/rede: o `index.ts` lê o curso, assina as URLs e chama estas
 * funções, que são testadas no Node (`assinaturas.test.ts`).
 *
 * Decisão D7 (Javerson, 06/10/2026): vale a IMAGEM da assinatura (não ICP-Brasil). O RH anexa a imagem na
 * tela do curso; o banco guarda só a referência "bucket/caminho" no bucket `assinaturas` (nunca URL
 * assinada, que expira). Na emissão a referência é CONGELADA em `dados` (entra no hash, como o nome e o
 * registro), então trocar a imagem do curso depois não muda certificado já emitido. Por isso o arquivo
 * antigo nunca é apagado do Storage. O aluno recebe só URL assinada na hora (`dadosParaOAluno`) e a
 * referência, que traz o id da empresa no caminho, não sai do servidor.
 *
 * Referência do Base44 (as 179 antigas do catálogo, todas mortas), URL, outro bucket, pasta de outra
 * empresa e arquivo que não é PNG/JPEG são ignorados: o certificado sai só com o nome e o registro.
 */

/** Bucket privado das assinaturas (migração 0015; só a pasta da empresa é lida e gravada). */
export const BUCKET_ASSINATURAS = "assinaturas";

const EXTENSAO_DE_IMAGEM = /\.(png|jpe?g)$/i;
const ARQUIVO_DO_BASE44 = /base44\./i;

/** Quem assina no certificado além do aluno: chave em `dados`, na ordem em que aparecem no PDF. */
const PESSOAS_COM_ASSINATURA = ["instrutor", "responsavel_tecnico"] as const;

/**
 * A referência "bucket/caminho" da assinatura, ou null. Só passa o que está em `assinaturas/<empresa>/...`,
 * é imagem (PNG ou JPEG, o que o PDF sabe desenhar) e não escapa da pasta (`.`, `..`, `//`, `\`). URL de
 * qualquer tipo não é referência (a regra do projeto é gravar a referência, nunca o `file_url`).
 */
export function refDaAssinatura(valor: unknown, empresaId: string): string | null {
  if (typeof valor !== "string" || !empresaId) return null;
  const ref = valor.trim();
  if (!ref || ARQUIVO_DO_BASE44.test(ref) || ref.includes("\\") || ref.includes(":")) return null;
  const partes = ref.split("/"); // [bucket, empresa_id, ...caminho]
  if (partes.length < 3 || partes.some((p) => !p || p === "." || p === "..")) return null;
  if (partes[0] !== BUCKET_ASSINATURAS || partes[1] !== empresaId) return null;
  return EXTENSAO_DE_IMAGEM.test(ref) ? ref : null;
}

/**
 * Instrutor como entra em `dados` na emissão. Sem assinatura válida (ou sem nome do instrutor: imagem de
 * ninguém não vale) o objeto é o mesmo de antes da T29, sem chave nova. Com assinatura, leva `assinatura_ref`.
 */
export function instrutorDoCertificado(
  curso: {
    instrutor_nome?: string | null;
    instrutor_qualificacao?: string | null;
    instrutor_assinatura_ref?: string | null;
  },
  empresaId: string
): { nome: string | null; qualificacao: string | null; assinatura_ref?: string } {
  const pessoa = {
    nome: curso.instrutor_nome ?? null,
    qualificacao: curso.instrutor_qualificacao ?? null,
  };
  return comAssinatura(pessoa, curso.instrutor_assinatura_ref, empresaId);
}

/** Responsável técnico como entra em `dados` na emissão (mesmas regras de `instrutorDoCertificado`). */
export function responsavelTecnicoDoCertificado(
  curso: {
    responsavel_tecnico_nome?: string | null;
    responsavel_tecnico_registro?: string | null;
    responsavel_tecnico_assinatura_ref?: string | null;
  },
  empresaId: string
): { nome: string | null; registro: string | null; assinatura_ref?: string } {
  const pessoa = {
    nome: curso.responsavel_tecnico_nome ?? null,
    registro: curso.responsavel_tecnico_registro ?? null,
  };
  return comAssinatura(pessoa, curso.responsavel_tecnico_assinatura_ref, empresaId);
}

function comAssinatura<T extends { nome: string | null }>(
  pessoa: T,
  refDoCurso: unknown,
  empresaId: string
): T & { assinatura_ref?: string } {
  const ref = pessoa.nome?.trim() ? refDaAssinatura(refDoCurso, empresaId) : null;
  return ref ? { ...pessoa, assinatura_ref: ref } : pessoa;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** Referências válidas congeladas nos certificados (sem repetir), para assinar todas de uma vez. */
export function refsDasAssinaturas(
  certificados: { dados?: unknown }[] | null | undefined,
  empresaId: string
): string[] {
  const refs = new Set<string>();
  for (const cert of certificados ?? []) {
    if (!ehObjeto(cert?.dados)) continue;
    for (const chave of PESSOAS_COM_ASSINATURA) {
      const pessoa = cert.dados[chave];
      const ref = ehObjeto(pessoa) ? refDaAssinatura(pessoa.assinatura_ref, empresaId) : null;
      if (ref) refs.add(ref);
    }
  }
  return [...refs];
}

/**
 * A linha do certificado como a ação `certificado` a devolve ao aluno: o `dados` sem a referência da
 * assinatura (o portal recarrega os `dados` e recebe a URL assinada, então aqui não há URL).
 */
export function certificadoParaOAluno<T extends { dados?: unknown }>(
  linha: T,
  empresaId: string
): T {
  return { ...linha, dados: dadosParaOAluno(linha.dados, empresaId, () => null) };
}

/**
 * O `dados` do certificado como o aluno recebe: sem `assinatura_ref` (o caminho tem o id da empresa), e
 * com `tem_assinatura` + `assinatura_url` (URL assinada por `urlDe`, ou null se não deu para assinar: o
 * PDF sai sem a imagem e a tela avisa). Certificado sem assinatura sai igual ao gravado, sem chave nova.
 * `assinatura_url` e `tem_assinatura` que viessem do banco são descartados: só o servidor os cria.
 */
export function dadosParaOAluno(
  dados: unknown,
  empresaId: string,
  urlDe: (ref: string) => string | null | undefined
): unknown {
  if (!ehObjeto(dados)) return dados;
  const saida: Record<string, unknown> = { ...dados };
  for (const chave of PESSOAS_COM_ASSINATURA) {
    const pessoa = dados[chave];
    if (!ehObjeto(pessoa)) continue;
    // deno-lint-ignore no-unused-vars
    const { assinatura_ref, assinatura_url, tem_assinatura, ...resto } = pessoa;
    const ref = refDaAssinatura(assinatura_ref, empresaId);
    saida[chave] = ref
      ? { ...resto, tem_assinatura: true, assinatura_url: urlDe(ref) || null }
      : resto;
  }
  return saida;
}
