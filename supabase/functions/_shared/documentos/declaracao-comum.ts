/**
 * O que o .docx e o PDF da declaração desenham igual (spec 2026-10-09 §3): o logo e a caixa em que
 * ele cabe, as linhas do papel timbrado e as linhas do bloco de assinatura. Fica num módulo só para
 * os dois formatos não divergirem. Puro.
 */
import type { DadosDeclaracao } from "./declaracoes.ts";
import type { ImagemLida } from "./imagem.ts";

export interface LogoDocumento extends ImagemLida {
  bytes: Uint8Array;
}

/** Caixa do logo (mm): cabe em 50 × 18 sem deformar. */
export const LOGO_LARGURA_MM = 50;
export const LOGO_ALTURA_MM = 18;

/** Tamanho (mm) do logo dentro da caixa LOGO_LARGURA_MM × LOGO_ALTURA_MM, mantida a proporção. */
export function caixaDoLogo(logo: Pick<ImagemLida, "largura" | "altura">): {
  larguraMm: number;
  alturaMm: number;
} {
  const escala = Math.min(LOGO_LARGURA_MM / logo.largura, LOGO_ALTURA_MM / logo.altura);
  return { larguraMm: logo.largura * escala, alturaMm: logo.altura * escala };
}

/** Papel timbrado: nome, CNPJ, endereço e contato da empresa; a linha vazia não entra. */
export function linhasDaEmpresa(d: DadosDeclaracao): string[] {
  return [
    d.empresa.nome,
    d.empresa.cnpj ? `CNPJ: ${d.empresa.cnpj}` : "",
    d.empresa.endereco,
    d.empresa.contato,
  ].filter(Boolean);
}

/** Bloco de assinatura: nome, cargo e CPF do representante e a empresa; a linha vazia não entra. */
export function linhasDaAssinatura(d: DadosDeclaracao): string[] {
  return [
    d.representante.nome,
    d.representante.cargo,
    d.representante.cpf ? `CPF: ${d.representante.cpf}` : "",
    d.empresa.nome,
  ].filter(Boolean);
}
