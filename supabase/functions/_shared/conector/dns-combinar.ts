/**
 * Junta as respostas de DNS dos tipos A (IPv4) e AAAA (IPv6) de um nome, para a conferência de destino do
 * download por URL (`url-segura.ts`: todo endereço do nome tem de ser público). Puro: a consulta em si
 * (Deno.resolveDns e a reserva por DNS-over-HTTPS) fica em `mcp/gerador.ts`, que só roda no Deno; a leitura da
 * resposta do DNS-over-HTTPS (`interpretarRespostaDoh`) fica aqui, para ter teste.
 *
 * A regra que importa: uma consulta que FALHOU por erro (rede, tempo, servidor) deixa um lado do nome sem
 * conferir. Se só o outro lado fosse devolvido, o download poderia sair pelo endereço que ninguém conferiu.
 * Por isso uma falha em qualquer dos dois tipos anula o resultado inteiro (lista vazia = quem chama recusa).
 * "O nome não existe" (ou não tem esse tipo de registro) NÃO é falha: host só IPv4 ou só IPv6 é normal.
 */
export type ConsultaDns =
  /** O servidor respondeu; `enderecos` pode estar vazio. */
  | { situacao: "ok"; enderecos: string[] }
  /** O servidor respondeu que o nome (ou o tipo de registro) não existe. */
  | { situacao: "nao_existe" }
  /** Erro ou tempo esgotado, sem resposta nem na reserva: o lado ficou sem conferir. */
  | { situacao: "falhou" };

/** Os endereços para conferir, ou [] se não dá para garantir que são todos (ver o cabeçalho). */
export function combinarConsultasDns(a: ConsultaDns, aaaa: ConsultaDns): string[] {
  if (a.situacao === "falhou" || aaaa.situacao === "falhou") return [];
  return [
    ...(a.situacao === "ok" ? a.enderecos : []),
    ...(aaaa.situacao === "ok" ? aaaa.enderecos : []),
  ];
}

/** Código de tipo de registro no JSON do DNS-over-HTTPS: 1 = A, 28 = AAAA. */
const TIPO_DOH = { A: 1, AAAA: 28 } as const;
/** RCODE do DNS: 0 = NOERROR; 3 = NXDOMAIN (o nome não existe). Os outros (SERVFAIL, REFUSED...) são erro. */
const RCODE_SEM_ERRO = 0;
const RCODE_NAO_EXISTE = 3;

/**
 * Lê o JSON de uma resposta do DNS-over-HTTPS (`https://dns.google/resolve`, a reserva quando o runtime não deixa
 * usar o resolvedor próprio) como uma `ConsultaDns`. O campo `Status` é o RCODE da resposta:
 *   - 0 (NOERROR): o servidor respondeu; vale a lista de `Answer` do tipo pedido, que pode ser vazia (o nome existe,
 *     mas não tem esse tipo de registro; a cadeia de CNAME fica de fora);
 *   - 3 (NXDOMAIN): o nome não existe (`nao_existe`), sem olhar o resto do corpo;
 *   - qualquer outro valor, ou um corpo que não tem esse formato: `falhou` (o servidor não deu uma resposta de
 *     verdade, e o lado fica sem conferir).
 * Sem esta leitura, um SERVFAIL seria tomado como "sem endereços" e passaria por "o nome não tem esse registro".
 */
export function interpretarRespostaDoh(corpo: unknown, tipo: "A" | "AAAA"): ConsultaDns {
  const falhou: ConsultaDns = { situacao: "falhou" };
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return falhou;
  const { Status: status, Answer: resposta } = corpo as { Status?: unknown; Answer?: unknown };
  if (typeof status !== "number" || !Number.isInteger(status)) return falhou;
  if (status === RCODE_NAO_EXISTE) return { situacao: "nao_existe" };
  if (status !== RCODE_SEM_ERRO) return falhou;
  if (resposta === undefined || resposta === null) return { situacao: "ok", enderecos: [] };
  if (!Array.isArray(resposta)) return falhou;
  const enderecos: string[] = [];
  for (const r of resposta) {
    if (r && typeof r === "object" && (r as { type?: unknown }).type === TIPO_DOH[tipo]) {
      const dado = (r as { data?: unknown }).data;
      if (typeof dado === "string") enderecos.push(dado);
    }
  }
  return { situacao: "ok", enderecos };
}
