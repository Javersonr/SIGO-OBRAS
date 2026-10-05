/**
 * Fila de gravação com espera, para a tela que grava um objeto inteiro a cada edição (o quadro
 * do cronograma físico-financeiro grava `oportunidade.cronograma_ff` a cada célula).
 *
 * - Só o último valor é gravado, `esperaMs` depois da última mudança (`agendar`).
 * - As gravações saem uma de cada vez, na ordem em que entraram: a 2ª só começa quando a 1ª
 *   termina, e o banco nunca fica com um valor mais velho que o da tela.
 * - Falha: chama `aoFalhar(chave, erro)` e descarta, da mesma chave, o valor que esperava e os
 *   que já estavam na fila depois do que falhou (eles contêm a edição que falhou). Quem usa a
 *   fila volta a tela para o último valor gravado.
 *
 * A chave separa os donos dos valores (o id da oportunidade): agendar outra chave manda para a
 * fila, na hora, o valor que esperava, e a falha de uma chave não descarta as outras.
 *
 * API:
 * - agendar(chave, valor): troca o valor que espera e reinicia a espera;
 * - gravarJa(chave, valor): descarta o valor que esperava da mesma chave (o novo já o contém) e
 *   põe este na fila; resolve `true` (gravou) ou `false` (falhou ou foi descartado);
 * - descarregar(): põe na fila, na hora, o valor que esperava, e resolve como o `gravarJa`; sem
 *   nada esperando, resolve quando a fila esvazia, com o resultado da última gravação (`true` se
 *   não houve nenhuma);
 * - ocupada(): há valor esperando ou gravação na fila?
 */
export function criarFilaGravacao({ gravar, esperaMs = 1000, aoFalhar } = {}) {
  let timer = null;
  let esperando = null; // { chave, valor }
  let fila = Promise.resolve(true);
  let naFila = 0;
  const epocas = new Map(); // chave → nº de falhas (descarta o que entrou antes da falha)

  const epocaDe = (chave) => epocas.get(chave) ?? 0;

  const cancelarEspera = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    esperando = null;
  };

  const enfileirar = ({ chave, valor }) => {
    const minhaEpoca = epocaDe(chave);
    naFila += 1;
    fila = fila.then(async () => {
      try {
        if (minhaEpoca !== epocaDe(chave)) return false;
        await gravar(chave, valor);
        return true;
      } catch (erro) {
        epocas.set(chave, epocaDe(chave) + 1);
        if (esperando?.chave === chave) cancelarEspera();
        aoFalhar?.(chave, erro);
        return false;
      } finally {
        naFila -= 1;
      }
    });
    return fila;
  };

  const descarregar = () => {
    if (!esperando) return fila;
    const item = esperando;
    cancelarEspera();
    return enfileirar(item);
  };

  const agendar = (chave, valor) => {
    if (esperando && esperando.chave !== chave) descarregar();
    if (timer !== null) clearTimeout(timer);
    esperando = { chave, valor };
    timer = setTimeout(() => {
      timer = null;
      descarregar();
    }, esperaMs);
  };

  const gravarJa = (chave, valor) => {
    if (esperando?.chave === chave) cancelarEspera();
    else if (esperando) descarregar();
    return enfileirar({ chave, valor });
  };

  const ocupada = () => esperando !== null || naFila > 0;

  return { agendar, gravarJa, descarregar, ocupada };
}
