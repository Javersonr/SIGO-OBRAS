/**
 * Edição do roteiro do caso com decisões na tela do RH (CasoEditor.jsx) — regra pura, sem DOM e sem rede.
 *
 * Toda função recebe o roteiro e devolve um roteiro NOVO (o recebido não muda), sempre no formato do contrato C3:
 * { contexto, etapas: [{ id, pergunta, opcoes: [{ texto, comentario, segura, proxima }] }], reflexao }. As etapas
 * e opções são apontadas pela POSIÇÃO na lista (o código da etapa pode estar vazio ou repetido enquanto o RH
 * digita). A validade, o que impede salvar, é de `validarCaso` (lib/ead-caso.js), a mesma regra do servidor.
 * Testes: ead-caso-edicao.test.js.
 */
import { LIMITES_CASO, novoCasoVazio, proximoIdDeEtapa } from "./ead-caso.js";

/** Valor do "leva para" que encerra o caso (o Select do Radix não aceita valor vazio). */
export const FIM = "__fim__";
const MAX_CODIGO = 20;

const textoDe = (v) => (typeof v === "string" ? v : "");
const destinoDe = (v) => (typeof v === "string" && v !== "" && v !== FIM ? v : null);
const opcaoDe = (o) => ({
  texto: textoDe(o?.texto),
  comentario: textoDe(o?.comentario),
  segura: o?.segura === true,
  proxima: destinoDe(o?.proxima),
});
const opcaoNova = (segura, proxima) => ({ texto: "", comentario: "", segura, proxima });

/**
 * O roteiro pronto para editar: cópia normalizada (segura só com `true`; destino vazio ou FIM vira `null`; o que
 * falta vira texto vazio). JSON em texto é lido; roteiro ausente ou sem lista de etapas vira o caso vazio de
 * partida (`novoCasoVazio`).
 */
export function casoParaEditar(conteudo) {
  let c = conteudo;
  if (typeof c === "string") {
    try {
      c = JSON.parse(c);
    } catch {
      c = null;
    }
  }
  if (!c || typeof c !== "object" || !Array.isArray(c.etapas)) return novoCasoVazio();
  return {
    contexto: textoDe(c.contexto),
    etapas: c.etapas.map((e) => ({
      id: textoDe(e?.id),
      pergunta: textoDe(e?.pergunta),
      opcoes: Array.isArray(e?.opcoes) ? e.opcoes.map(opcaoDe) : [],
    })),
    reflexao: textoDe(c.reflexao),
  };
}

/** Aplica `mudar(etapa)` à etapa da posição `indice`; posição que não existe devolve o roteiro como está. */
function comEtapa(conteudo, indice, mudar) {
  const c = casoParaEditar(conteudo);
  const etapa = c.etapas[indice];
  if (!etapa) return c;
  const nova = mudar(etapa);
  return nova === etapa ? c : { ...c, etapas: c.etapas.map((e, i) => (i === indice ? nova : e)) };
}

/**
 * Etapa nova no fim, com código livre ("e<n>"), uma saída segura que encerra o caso e uma insegura que volta a ela.
 * Até LIMITES_CASO.etapas.
 */
export function adicionarEtapa(conteudo) {
  const c = casoParaEditar(conteudo);
  if (c.etapas.length >= LIMITES_CASO.etapas) return c;
  const id = proximoIdDeEtapa(c);
  return {
    ...c,
    etapas: [
      ...c.etapas,
      { id, pergunta: "", opcoes: [opcaoNova(true, null), opcaoNova(false, id)] },
    ],
  };
}

/**
 * Remove a etapa da posição `indice` (a única não sai). As opções que levavam a ela são corrigidas: a segura
 * passa a encerrar o caso e a insegura volta para a própria etapa (só a segura pode encerrar). Se outra etapa
 * tem o mesmo código, ele continua sendo um destino válido e nada muda nas opções.
 */
export function removerEtapa(conteudo, indice) {
  const c = casoParaEditar(conteudo);
  const alvo = c.etapas[indice];
  if (!alvo || c.etapas.length <= 1) return c;
  const restantes = c.etapas.filter((_, i) => i !== indice);
  const sumiu = !!alvo.id && !restantes.some((e) => e.id === alvo.id);
  return {
    ...c,
    etapas: restantes.map((e) => ({
      ...e,
      opcoes: e.opcoes.map((o) =>
        sumiu && o.proxima === alvo.id ? { ...o, proxima: o.segura ? null : e.id || null } : o
      ),
    })),
  };
}

/**
 * Troca o código da etapa da posição `indice` e leva junto toda opção que apontava para o código antigo.
 * Recusa (com o motivo em `erro`) código vazio, com espaço, com mais de 20 caracteres ou de outra etapa.
 */
export function renomearEtapa(conteudo, indice, novoId) {
  const c = casoParaEditar(conteudo);
  const etapa = c.etapas[indice];
  if (!etapa) return { ok: false, erro: "Etapa não encontrada." };
  const id = textoDe(novoId).trim();
  if (!id) return { ok: false, erro: "Informe o código da etapa (ex.: e2 ou r1)." };
  if (/\s/.test(id)) return { ok: false, erro: "O código da etapa não pode ter espaço." };
  if (id.length > MAX_CODIGO) {
    return { ok: false, erro: `Use até ${MAX_CODIGO} caracteres no código da etapa.` };
  }
  if (id === etapa.id) return { ok: true, conteudo: c };
  if (c.etapas.some((e, i) => i !== indice && e.id === id)) {
    return { ok: false, erro: `Já existe uma etapa com o código ${id}.` };
  }
  const antigo = etapa.id;
  const unico = !!antigo && c.etapas.filter((e) => e.id === antigo).length === 1;
  return {
    ok: true,
    conteudo: {
      ...c,
      etapas: c.etapas.map((e, i) => ({
        ...e,
        id: i === indice ? id : e.id,
        opcoes: unico
          ? e.opcoes.map((o) => (o.proxima === antigo ? { ...o, proxima: id } : o))
          : e.opcoes,
      })),
    },
  };
}

/** Muda a pergunta da etapa da posição `indice`. */
export function alterarPergunta(conteudo, indice, pergunta) {
  return comEtapa(conteudo, indice, (etapa) => ({ ...etapa, pergunta: textoDe(pergunta) }));
}

/** Opção nova (insegura, voltando para a própria etapa) no fim da etapa; até LIMITES_CASO.opcoesMax. */
export function adicionarOpcao(conteudo, indiceEtapa) {
  return comEtapa(conteudo, indiceEtapa, (etapa) =>
    etapa.opcoes.length >= LIMITES_CASO.opcoesMax
      ? etapa
      : { ...etapa, opcoes: [...etapa.opcoes, opcaoNova(false, etapa.id || null)] }
  );
}

/** Remove a opção; a etapa nunca fica com menos de LIMITES_CASO.opcoesMin. */
export function removerOpcao(conteudo, indiceEtapa, indiceOpcao) {
  return comEtapa(conteudo, indiceEtapa, (etapa) =>
    etapa.opcoes.length <= LIMITES_CASO.opcoesMin || !etapa.opcoes[indiceOpcao]
      ? etapa
      : { ...etapa, opcoes: etapa.opcoes.filter((_, i) => i !== indiceOpcao) }
  );
}

/**
 * Muda campos da opção (`texto`, `comentario`, `segura`, `proxima`; FIM encerra). Só a escolha segura encerra o
 * caso: a insegura sem destino volta para a própria etapa.
 */
export function alterarOpcao(conteudo, indiceEtapa, indiceOpcao, campos) {
  return comEtapa(conteudo, indiceEtapa, (etapa) => {
    const atual = etapa.opcoes[indiceOpcao];
    if (!atual) return etapa;
    const nova = opcaoDe({ ...atual, ...campos });
    if (!nova.segura && nova.proxima === null) nova.proxima = etapa.id || null;
    return { ...etapa, opcoes: etapa.opcoes.map((o, i) => (i === indiceOpcao ? nova : o)) };
  });
}

/** Os destinos do "leva para": os códigos das etapas, em ordem, sem vazio nem repetição. */
export function destinosDoCaso(conteudo) {
  const ids = [];
  for (const e of casoParaEditar(conteudo).etapas) {
    if (e.id && !ids.includes(e.id)) ids.push(e.id);
  }
  return ids;
}

/** O roteiro mudou? Compara os dois já normalizados (destino vazio e `null` são a mesma coisa). */
export function casoMudou(a, b) {
  return JSON.stringify(casoParaEditar(a)) !== JSON.stringify(casoParaEditar(b));
}
