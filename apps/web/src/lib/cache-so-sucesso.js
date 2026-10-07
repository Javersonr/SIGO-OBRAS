/**
 * Cache que guarda só o SUCESSO (A6, T34). Serve para o que se repete num lote e custa rede, como o logo da
 * empresa e as imagens de assinatura que o dossiê desenha em dezenas de certificados.
 *
 * O cache simples (um Map com o resultado, qualquer que fosse) guardava também a falha: se a primeira
 * imagem caía por um instante de rede, `null` ficava no cache e TODOS os certificados do lote saíam sem ela.
 * Aqui: resultado vazio (`null`, `undefined`) ou exceção é falha, não é guardada, e a leitura seguinte tenta
 * de novo. Para não refazer a rede a cada certificado quando o arquivo some de vez (apagado, sem permissão),
 * depois de `maxFalhas` falhas seguidas da MESMA chave ela passa a valer `null` sem tentar mais. Pedidos ao
 * mesmo tempo para a mesma chave dividem uma busca só (e a falha dela conta uma vez).
 *
 * @param {(chave: string) => Promise<any> | any} buscar devolve o valor, ou vazio se não conseguiu
 * @param {{ maxFalhas?: number }} [opcoes]
 * @returns {(chave: string) => Promise<any>} o valor, ou `null` se falhou ou se desistiu da chave
 */
export function criarCacheSoDeSucesso(buscar, { maxFalhas = 3 } = {}) {
  const guardados = new Map();
  const falhas = new Map();
  const emAndamento = new Map();

  return (chave) => {
    if (guardados.has(chave)) return Promise.resolve(guardados.get(chave));
    if ((falhas.get(chave) ?? 0) >= maxFalhas) return Promise.resolve(null);
    if (emAndamento.has(chave)) return emAndamento.get(chave);
    const busca = (async () => {
      try {
        const valor = await buscar(chave);
        if (valor !== null && valor !== undefined) {
          guardados.set(chave, valor);
          return valor;
        }
      } catch {
        // falha de rede, URL vencida ou formato: conta como falha (quem chamou segue sem a imagem)
      }
      falhas.set(chave, (falhas.get(chave) ?? 0) + 1);
      return null;
    })().finally(() => emAndamento.delete(chave));
    emAndamento.set(chave, busca);
    return busca;
  };
}
