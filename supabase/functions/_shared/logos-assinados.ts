/**
 * Logos de empresa / grupo empresarial para telas SEM sessão do Supabase Auth
 * (escolha de empresa no login). O banco guarda em `logo_url` a referência
 * estável "bucket/caminho" (ou URL legada do nosso Storage); aqui assinamos
 * com service role e devolvemos um MAPA `{ [id]: urlAssinada | null }`.
 *
 * O mapa vai no nível de cima da resposta — nunca como campo novo dentro do
 * objeto empresa: esse objeto pode voltar num `Empresa.update({...empresa})`
 * e o PostgREST rejeita coluna inexistente.
 *
 * Só assina o que está na pasta de uma empresa permitida (1º segmento do
 * caminho = empresa_id, mesma regra da RLS do Storage). Base44 (arquivos
 * apagados), objeto sumido ou pasta de outra empresa → null (a tela mostra o
 * nome/ícone). Link externo volta como está.
 */
import { assinarDaEmpresa, refDaEmpresa, urlParaExibir } from "./storage-assinar.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

// A tela de escolha é rápida; depois do login o app assina de novo com a sessão.
const TTL_LOGO = 60 * 60;

export interface ItemLogo {
  /** id da empresa ou do grupo (chave do mapa) */
  id: string;
  logo_url?: string | null;
  /** empresas cuja pasta pode conter o logo (empresa: ela mesma; grupo: as do grupo) */
  empresasPermitidas: string[];
}

async function logoAssinado(
  supabase: Db,
  logoUrl: string | null | undefined,
  empresasPermitidas: string[]
): Promise<string | null> {
  if (!logoUrl) return null;
  const dona = empresasPermitidas.find((id) => id && refDaEmpresa(logoUrl, id));
  const assinadas = dona
    ? await assinarDaEmpresa(supabase, [logoUrl], dona, TTL_LOGO)
    : new Map<string, string>();
  return urlParaExibir(logoUrl, assinadas);
}

/** `{ [id]: urlAssinada | null }` — best-effort: falha de assinatura vira null. */
export async function mapaLogosAssinados(
  supabase: Db,
  itens: ItemLogo[]
): Promise<Record<string, string | null>> {
  const pares = await Promise.all(
    itens
      .filter((i) => i?.id)
      .map(async (i): Promise<[string, string | null]> => {
        try {
          return [i.id, await logoAssinado(supabase, i.logo_url, i.empresasPermitidas)];
        } catch (e) {
          console.error("[logos-assinados]", i.id, (e as Error)?.message);
          return [i.id, null];
        }
      })
  );
  return Object.fromEntries(pares);
}
