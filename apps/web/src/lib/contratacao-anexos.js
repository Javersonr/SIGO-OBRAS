/**
 * Listas de anexos da Contratação (documentos pessoais e exames).
 *
 * A tela faz "lê a lista, mexe e grava a lista inteira". Quando dois envios ou uma leitura da IA
 * rodam juntos (ou há outra aba aberta), quem grava por último partia de uma cópia velha e apagava
 * o que o outro fez: a IA renomeia o arquivo no Storage e a lista ficava com o nome antigo
 * ("Object not found"). Aqui toda mudança é aplicada sobre a lista ATUAL do banco, pela ref.
 */

/** Lista de anexos como array (o jsonb do legado pode vir como texto JSON). */
export function listaDeAnexos(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === "string") {
    try {
      const lido = JSON.parse(valor);
      return Array.isArray(lido) ? lido : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Junta os novos no fim da lista atual, sem repetir a mesma ref. */
export function juntarAnexos(atuais, novos) {
  const lista = [...listaDeAnexos(atuais)];
  const refs = new Set(lista.map((x) => x?.ref));
  for (const n of listaDeAnexos(novos)) {
    if (!refs.has(n?.ref)) {
      lista.push(n);
      refs.add(n?.ref);
    }
  }
  return lista;
}

/**
 * Leva para a lista ATUAL o resultado de um processamento feito sobre uma cópia (`antes` → `depois`,
 * mesma ordem e mesmo tamanho): cada anexo de `antes` que ainda está na atual vira o seu `depois`
 * (ref, nome e classificação novos); o que entrou depois da cópia continua; o que saiu não volta.
 */
export function reconciliarAnexos(atuais, antes, depois) {
  const lista = listaDeAnexos(atuais);
  const a = listaDeAnexos(antes);
  const d = listaDeAnexos(depois);
  if (a.length !== d.length) return lista;
  const novoPorRef = new Map(a.map((x, i) => [x?.ref, d[i]]));
  return lista.map((x) => (novoPorRef.has(x?.ref) ? novoPorRef.get(x?.ref) : x));
}

/** Remove o anexo pela ref (a posição pode ter mudado). */
export function semAnexo(atuais, ref) {
  return listaDeAnexos(atuais).filter((x) => x?.ref !== ref);
}

/** Troca o anexo de ref `ref` por `novo`; se ele já saiu da lista, nada muda. */
export function comAnexoTrocado(atuais, ref, novo) {
  return listaDeAnexos(atuais).map((x) => (x?.ref === ref ? novo : x));
}
