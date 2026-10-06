/**
 * Fila de gravação com espera, para a tela que grava um objeto inteiro a cada edição (o quadro
 * do cronograma físico-financeiro grava `oportunidade.cronograma_ff` a cada célula).
 *
 * - Só o último valor é gravado, `esperaMs` depois da última mudança (`agendar`).
 * - As gravações saem uma de cada vez, na ordem em que entraram: a 2ª só começa quando a 1ª
 *   termina, e o banco nunca fica com um valor mais velho que o da tela.
 * - Gravou: chama `aoGravar(chave, valor)` (quem usa a fila guarda o valor como o último gravado
 *   e o repassa ao pai).
 * - Falha: chama `aoFalhar(chave, erro)` e descarta, da mesma chave, o valor que esperava e os
 *   que já estavam na fila depois do que falhou (eles contêm a edição que falhou). Quem usa a
 *   fila volta a tela para o último valor gravado.
 * - Um erro dentro do `aoGravar` ou do `aoFalhar` vai para o console e a fila segue.
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
 * - valorPendente(chave): o valor mais novo da chave que entrou (`agendar` ou `gravarJa`) e
 *   ainda não foi gravado, esperando ou gravando; `undefined` quando não há (tudo gravado, ou
 *   descartado numa falha). A tela que monta de novo parte dele, não do valor velho do pai;
 * - definirAvisos({ aoGravar, aoFalhar }): troca quem recebe os avisos, também das gravações que
 *   já estavam na fila (a montagem mais nova da tela).
 */
export function criarFilaGravacao({ gravar, esperaMs = 1000, aoGravar, aoFalhar } = {}) {
  let avisos = { aoGravar, aoFalhar };
  let timer = null;
  let esperando = null; // { chave, valor }
  let fila = Promise.resolve(true);
  let naFila = 0;
  const epocas = new Map(); // chave → nº de falhas (descarta o que entrou antes da falha)
  const pendentes = new Map(); // chave → valor mais novo que entrou e ainda não foi gravado

  const epocaDe = (chave) => epocas.get(chave) ?? 0;

  // um erro dentro do aviso não pode rejeitar a fila: as gravações seguintes seriam puladas para
  // sempre e `ocupada()` ficaria true
  const avisar = (nome, chave, dado) => {
    try {
      avisos[nome]?.(chave, dado);
    } catch (erroNoAviso) {
      console.error(`Erro no aviso ${nome} da fila de gravação:`, erroNoAviso);
    }
  };

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
        try {
          await gravar(chave, valor);
        } catch (erro) {
          epocas.set(chave, epocaDe(chave) + 1);
          pendentes.delete(chave);
          if (esperando?.chave === chave) cancelarEspera();
          avisar("aoFalhar", chave, erro);
          return false;
        }
        if (pendentes.get(chave) === valor) pendentes.delete(chave);
        avisar("aoGravar", chave, valor);
        return true;
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
    pendentes.set(chave, valor);
    timer = setTimeout(() => {
      timer = null;
      descarregar();
    }, esperaMs);
  };

  const gravarJa = (chave, valor) => {
    if (esperando?.chave === chave) cancelarEspera();
    else if (esperando) descarregar();
    pendentes.set(chave, valor);
    return enfileirar({ chave, valor });
  };

  const ocupada = () => esperando !== null || naFila > 0;

  const valorPendente = (chave) => pendentes.get(chave);

  const definirAvisos = (novos = {}) => {
    avisos = { aoGravar: novos.aoGravar, aoFalhar: novos.aoFalhar };
  };

  return { agendar, gravarJa, descarregar, ocupada, valorPendente, definirAvisos };
}

/**
 * Uma fila por chave, para guardar no escopo do módulo de quem grava (o quadro do cronograma
 * guarda uma fila por oportunidade). `obterFila(chave)` devolve sempre a mesma fila para a mesma
 * chave: a tela desmonta (troca de aba) e monta de novo, e as gravações das duas montagens saem
 * em ordem na mesma fila, em vez de cada montagem ter a sua e a gravação nova, feita sobre o
 * valor velho, terminar depois e apagar a anterior. `gravar` e `esperaMs` valem para todas; os
 * avisos de cada fila vêm do `definirAvisos` da montagem mais nova. Uma fila por chave aberta
 * fica no Map até a página recarregar (é pequena: só guarda o valor pendente).
 */
export function filasPorChave({ gravar, esperaMs } = {}) {
  const filas = new Map();
  return function obterFila(chave) {
    let fila = filas.get(chave);
    if (!fila) {
      fila = criarFilaGravacao({ gravar, esperaMs });
      filas.set(chave, fila);
    }
    return fila;
  };
}
