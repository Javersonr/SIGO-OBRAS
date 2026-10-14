/**
 * Junta as respostas de DNS dos tipos A (IPv4) e AAAA (IPv6) de um nome, para a conferência de destino do
 * download por URL (`url-segura.ts`: todo endereço do nome tem de ser público). Puro: a consulta em si
 * (Deno.resolveDns e a reserva por DNS-over-HTTPS) fica em `mcp/gerador.ts`, que só roda no Deno.
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
