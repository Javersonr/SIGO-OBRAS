/**
 * Roteiro do caso com decisões (atividade interativa do EAD, spec 2026-10-14 §4.3 e §7): módulo PURO.
 *
 * Sem `Deno.*`, sem import de URL e sem banco: o `index.ts` lê o roteiro (`treinamento_caso.conteudo`) e as
 * escolhas gravadas na trilha (`treinamento_evento`) e chama estas funções. Espelho do front
 * (`apps/web/src/lib/ead-caso.js`): `caso.test.ts` roda a mesma tabela de casos contra as duas cópias. Mudou aqui,
 * mude lá (e vice-versa). Só aqui: `escolhasDaRodada` (a trilha só existe no servidor).
 *
 * conteudo = { contexto, etapas: [{ id, pergunta, opcoes: [{ texto, comentario, segura, proxima }] }], reflexao }
 * O caso começa na PRIMEIRA etapa da lista; `proxima` é o id de outra etapa ou null (fim). Só opção segura encerra.
 */

export const LIMITES_CASO = { etapas: 30, opcoesMin: 2, opcoesMax: 6, texto: 1000, longo: 4000 };

export type ProblemaDoCaso = { codigo: string; texto: string; etapa: string | null };

export type OpcaoDoCaso = {
  texto: string;
  comentario: string;
  segura: boolean;
  proxima: string | null;
};
export type EtapaDoCaso = { id: string; pergunta: string; opcoes: OpcaoDoCaso[] };
export type RoteiroDoCaso = {
  contexto?: string | null;
  etapas: EtapaDoCaso[];
  reflexao?: string | null;
};

export type EstadoDoCaso = {
  valido: boolean;
  motivo: "CASO_INVALIDO" | "CAMINHO_DIVERGENTE" | null;
  fim: boolean;
  etapaAtual: string | null;
  passagens: Record<string, number>;
  ultimo: { comentario: string; segura: boolean } | null;
};

export type EscolhaDoCaso = { etapa: string; opcao: number };

export type ResultadoDaEscolha =
  | {
      ok: false;
      codigo: "CASO_INVALIDO" | "CASO_ENCERRADO" | "CASO_FORA_DE_ORDEM" | "OPCAO_INVALIDA";
    }
  | {
      ok: true;
      comentario: string;
      segura: boolean;
      proxima: string | null;
      fim: boolean;
      passagem: number;
    };

// deno-lint-ignore no-explicit-any
type Qualquer = any;

const ehObjeto = (v: unknown): v is Record<string, Qualquer> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const preenchido = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const milhar = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Problemas de FORMA (tipos errados): sem eles, o resto da validação pode ler o roteiro sem cuidado. */
function problemasDeFormato(conteudo: unknown): ProblemaDoCaso[] {
  const formato = (texto: string, etapa: string | null = null): ProblemaDoCaso => ({
    codigo: "FORMATO",
    texto,
    etapa,
  });
  if (!ehObjeto(conteudo) || !Array.isArray(conteudo.etapas)) {
    return [
      formato("O roteiro do caso não está no formato esperado (contexto, etapas e reflexão)"),
    ];
  }
  const problemas: ProblemaDoCaso[] = [];
  for (const campo of ["contexto", "reflexao"]) {
    const v = conteudo[campo];
    if (v !== undefined && v !== null && typeof v !== "string") {
      problemas.push(formato(`O campo "${campo}" do caso precisa ser um texto`));
    }
  }
  conteudo.etapas.forEach((etapa: unknown, i: number) => {
    const nome = ehObjeto(etapa) && preenchido(etapa.id) ? etapa.id : null;
    if (!ehObjeto(etapa)) {
      problemas.push(formato(`A etapa nº ${i + 1} não está no formato esperado`));
      return;
    }
    if (etapa.id !== undefined && etapa.id !== null && typeof etapa.id !== "string") {
      problemas.push(formato(`O identificador da etapa nº ${i + 1} precisa ser um texto`));
    }
    if (
      etapa.pergunta !== undefined &&
      etapa.pergunta !== null &&
      typeof etapa.pergunta !== "string"
    ) {
      problemas.push(formato(`A pergunta da etapa nº ${i + 1} precisa ser um texto`, nome));
    }
    if (!Array.isArray(etapa.opcoes)) {
      problemas.push(formato(`As opções da etapa nº ${i + 1} precisam ser uma lista`, nome));
      return;
    }
    etapa.opcoes.forEach((opcao: unknown, k: number) => {
      const ok =
        ehObjeto(opcao) &&
        (opcao.texto === undefined || opcao.texto === null || typeof opcao.texto === "string") &&
        (opcao.comentario === undefined ||
          opcao.comentario === null ||
          typeof opcao.comentario === "string") &&
        typeof opcao.segura === "boolean" &&
        (opcao.proxima === null || typeof opcao.proxima === "string");
      if (!ok) {
        problemas.push(
          formato(
            `A opção ${k + 1} da etapa nº ${i + 1} não está no formato esperado (texto, comentário, segura e próxima)`,
            nome
          )
        );
      }
    });
  });
  return problemas;
}

/**
 * Problemas do roteiro; lista vazia = caso válido. A mesma regra vale na tela do RH (o "Salvar" fica desabilitado
 * com qualquer problema) e no servidor (roteiro inválido: 409 CASO_INVALIDO, nada é gravado).
 */
export function validarCaso(conteudo: unknown): ProblemaDoCaso[] {
  const formato = problemasDeFormato(conteudo);
  if (formato.length) return formato;
  const roteiro = conteudo as RoteiroDoCaso;

  const problemas: ProblemaDoCaso[] = [];
  const add = (codigo: string, texto: string, etapa: string | null = null) =>
    problemas.push({ codigo, texto, etapa });
  const L = LIMITES_CASO;

  for (const [campo, rotulo] of [
    ["contexto", "O contexto"],
    ["reflexao", "A reflexão"],
  ] as const) {
    if ((roteiro[campo] ?? "").length > L.longo) {
      add("TAMANHO", `${rotulo} do caso passa de ${milhar(L.longo)} caracteres`);
    }
  }

  const etapas = roteiro.etapas;
  if (etapas.length === 0) {
    add("SEM_ETAPAS", "O caso precisa de pelo menos uma etapa");
    return problemas;
  }
  if (etapas.length > L.etapas) {
    add("MUITAS_ETAPAS", `O caso pode ter no máximo ${L.etapas} etapas (tem ${etapas.length})`);
  }

  const ids = new Set<string>();
  let idsConfiaveis = true;
  etapas.forEach((etapa, i) => {
    const id = preenchido(etapa.id) ? etapa.id : null;
    const nome = id ? `"${id}"` : `nº ${i + 1}`;
    if (!id) {
      add("ID_VAZIO", `A etapa nº ${i + 1} está sem identificador`);
      idsConfiaveis = false;
    } else if (ids.has(id)) {
      add("ID_REPETIDO", `O identificador "${id}" está em mais de uma etapa`, id);
      idsConfiaveis = false;
    } else {
      ids.add(id);
    }
    if (id && id.length > L.texto) {
      add(
        "TAMANHO",
        `O identificador da etapa nº ${i + 1} passa de ${milhar(L.texto)} caracteres`,
        id
      );
    }
    if (!preenchido(etapa.pergunta)) {
      add("PERGUNTA_VAZIA", `A etapa ${nome} está sem pergunta`, id);
    } else if (etapa.pergunta.length > L.texto) {
      add("TAMANHO", `A pergunta da etapa ${nome} passa de ${milhar(L.texto)} caracteres`, id);
    }
    if (etapa.opcoes.length < L.opcoesMin || etapa.opcoes.length > L.opcoesMax) {
      add(
        "OPCOES_QTD",
        `A etapa ${nome} precisa de ${L.opcoesMin} a ${L.opcoesMax} opções (tem ${etapa.opcoes.length})`,
        id
      );
    }
  });

  etapas.forEach((etapa, i) => {
    const id = preenchido(etapa.id) ? etapa.id : null;
    const nome = id ? `"${id}"` : `nº ${i + 1}`;
    etapa.opcoes.forEach((opcao, k) => {
      const qual = `A opção ${k + 1} da etapa ${nome}`;
      if (!preenchido(opcao.texto)) add("TEXTO_VAZIO", `${qual} está sem texto`, id);
      else if (opcao.texto.length > L.texto)
        add("TAMANHO", `${qual} passa de ${milhar(L.texto)} caracteres`, id);
      if (!preenchido(opcao.comentario)) add("COMENTARIO_VAZIO", `${qual} está sem comentário`, id);
      else if (opcao.comentario.length > L.texto)
        add(
          "TAMANHO",
          `O comentário da opção ${k + 1} da etapa ${nome} passa de ${milhar(L.texto)} caracteres`,
          id
        );
      if (opcao.proxima !== null && !ids.has(opcao.proxima)) {
        add(
          "PROXIMA_INEXISTENTE",
          `${qual} leva para uma etapa que não existe ("${opcao.proxima}")`,
          id
        );
      }
      if (opcao.proxima === null && opcao.segura !== true) {
        add(
          "FIM_INSEGURO",
          `${qual} encerra o caso, mas não é segura: só a opção segura encerra`,
          id
        );
      }
    });
    if (!etapa.opcoes.some((o) => o.segura === true)) {
      add("SEM_SEGURA", `A etapa ${nome} precisa de pelo menos uma opção segura`, id);
    }
  });

  // o caminho só é conferido com identificadores confiáveis (sem vazio nem repetido) e com o roteiro dentro dos
  // limites de etapas e de opções: o banco não limita o tamanho do roteiro e o servidor valida a cada clique,
  // então um roteiro enorme devolve só o que já foi achado, sem varrer o caminho
  const foraDosLimites = problemas.some(
    (p) => p.codigo === "MUITAS_ETAPAS" || p.codigo === "OPCOES_QTD"
  );
  if (!idsConfiaveis || foraDosLimites) return problemas;
  const porId = new Map(etapas.map((e) => [e.id, e]));
  const destinos = (etapa: EtapaDoCaso) => etapa.opcoes.map((o) => o.proxima);

  // alcançáveis a partir da primeira etapa (por qualquer opção)
  const alcancadas = new Set<string>([etapas[0].id]);
  const fila = [etapas[0].id];
  while (fila.length) {
    const etapa = porId.get(fila.shift() as string) as EtapaDoCaso;
    for (const destino of destinos(etapa)) {
      if (destino !== null && porId.has(destino) && !alcancadas.has(destino)) {
        alcancadas.add(destino);
        fila.push(destino);
      }
    }
  }
  for (const etapa of etapas) {
    if (!alcancadas.has(etapa.id)) {
      add(
        "INALCANCAVEL",
        `A etapa "${etapa.id}" nunca é alcançada a partir da primeira etapa`,
        etapa.id
      );
    }
  }

  // de onde se chega ao fim (o fim é uma opção SEGURA com proxima null)
  const chegaAoFim = (soSeguras: boolean) => {
    const chega = new Set<string>();
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const etapa of etapas) {
        if (chega.has(etapa.id)) continue;
        const sai = etapa.opcoes.some(
          (o) =>
            (!soSeguras || o.segura === true) &&
            ((o.proxima === null && o.segura === true) ||
              (o.proxima !== null && chega.has(o.proxima)))
        );
        if (sai) {
          chega.add(etapa.id);
          mudou = true;
        }
      }
    }
    return chega;
  };
  const comSaida = chegaAoFim(false);
  for (const etapa of etapas) {
    if (!comSaida.has(etapa.id)) {
      add("SEM_SAIDA", `Da etapa "${etapa.id}" não há como chegar ao fim do caso`, etapa.id);
    }
  }
  if (!chegaAoFim(true).has(etapas[0].id)) {
    add(
      "SEM_CAMINHO_SEGURO",
      "Não há caminho só de opções seguras da primeira etapa até o fim do caso"
    );
  }
  return problemas;
}

const estadoInvalido = (motivo: "CASO_INVALIDO" | "CAMINHO_DIVERGENTE"): EstadoDoCaso => ({
  valido: false,
  motivo,
  fim: false,
  etapaAtual: null,
  passagens: {},
  ultimo: null,
});

/**
 * Refaz o caminho do aluno no roteiro de HOJE a partir das escolhas gravadas (em ordem). Roteiro inválido:
 * `CASO_INVALIDO`; escolha que não confere (etapa que não é a atual, etapa ou opção que sumiu, clique depois do
 * fim): `CAMINHO_DIVERGENTE` (o servidor recomeça a rodada). `passagens` conta as visitas a cada etapa nesta rodada.
 */
export function estadoDoCaso(conteudo: unknown, escolhas: unknown): EstadoDoCaso {
  if (validarCaso(conteudo).length) return estadoInvalido("CASO_INVALIDO");
  const roteiro = conteudo as RoteiroDoCaso;
  const porId = new Map(roteiro.etapas.map((e) => [e.id, e]));
  let atual = roteiro.etapas[0].id;
  const passagens = new Map<string, number>([[atual, 1]]);
  let fim = false;
  let ultimo: EstadoDoCaso["ultimo"] = null;
  for (const escolha of Array.isArray(escolhas) ? escolhas : []) {
    if (fim || !ehObjeto(escolha) || escolha.etapa !== atual) {
      return estadoInvalido("CAMINHO_DIVERGENTE");
    }
    const etapa = porId.get(atual) as EtapaDoCaso;
    const opcao = Number.isInteger(escolha.opcao) ? etapa.opcoes[escolha.opcao] : undefined;
    if (!opcao) return estadoInvalido("CAMINHO_DIVERGENTE");
    ultimo = { comentario: opcao.comentario, segura: opcao.segura === true };
    if (opcao.proxima === null) {
      fim = true;
    } else {
      atual = opcao.proxima;
      passagens.set(atual, (passagens.get(atual) ?? 0) + 1);
    }
  }
  return {
    valido: true,
    motivo: null,
    fim,
    etapaAtual: fim ? null : atual,
    passagens: Object.fromEntries(passagens),
    ultimo,
  };
}

function sortear(n: number, aleatorio: (n: number) => number) {
  const j = aleatorio(n);
  if (!Number.isInteger(j) || j < 0 || j >= n) throw new RangeError("sorteio fora do intervalo");
  return j;
}

/** Fisher–Yates (o mesmo `embaralhar` da prova, regras.ts): embaralha uma cópia. */
function embaralhar<T>(itens: T[], aleatorio: (n: number) => number): T[] {
  const a = [...itens];
  for (let i = a.length - 1; i > 0; i--) {
    const j = sortear(i + 1, aleatorio);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A etapa como o aluno a vê: pergunta e opções SÓ com o texto e o índice original, em ordem embaralhada. Nunca
 * `segura`, `comentario` ou `proxima`. `aleatorio(n)` devolve um inteiro em [0, n); fora disso, RangeError. O
 * servidor passa o sorteio criptográfico (`inteiroAleatorioSeguro`), como na prova.
 */
export function etapaParaAluno(
  conteudo: unknown,
  etapaId: string,
  aleatorio: (n: number) => number
): { id: string; pergunta: string; opcoes: { indice: number; texto: string }[] } {
  const etapas: unknown[] =
    ehObjeto(conteudo) && Array.isArray(conteudo.etapas) ? conteudo.etapas : [];
  const etapa = etapas.find((e) => ehObjeto(e) && e.id === etapaId) as Qualquer;
  if (!etapa || !Array.isArray(etapa.opcoes)) throw new RangeError("etapa inexistente no roteiro");
  const ordem = embaralhar<number>(
    etapa.opcoes.map((_: unknown, i: number) => i),
    aleatorio
  );
  return {
    id: etapa.id,
    pergunta: String(etapa.pergunta ?? ""),
    opcoes: ordem.map((i) => ({ indice: i, texto: String(etapa.opcoes[i]?.texto ?? "") })),
  };
}

/**
 * O que acontece com o clique do aluno na opção `opcao` (índice ORIGINAL) da etapa `etapaId`, dado o estado
 * refeito: recusa (`CASO_INVALIDO`, `CASO_ENCERRADO`, `CASO_FORA_DE_ORDEM`, `OPCAO_INVALIDA`) ou o comentário,
 * se foi segura, para onde leva e a visita atual àquela etapa (`passagem`).
 */
export function resultadoDaEscolha(
  conteudo: unknown,
  estado: EstadoDoCaso | null | undefined,
  etapaId: unknown,
  opcao: unknown
): ResultadoDaEscolha {
  if (!estado?.valido || validarCaso(conteudo).length)
    return { ok: false, codigo: "CASO_INVALIDO" };
  if (estado.fim) return { ok: false, codigo: "CASO_ENCERRADO" };
  if (etapaId !== estado.etapaAtual) return { ok: false, codigo: "CASO_FORA_DE_ORDEM" };
  const etapa = (conteudo as RoteiroDoCaso).etapas.find((e) => e.id === etapaId) as EtapaDoCaso;
  if (
    typeof opcao !== "number" ||
    !Number.isInteger(opcao) ||
    opcao < 0 ||
    opcao >= etapa.opcoes.length
  ) {
    return { ok: false, codigo: "OPCAO_INVALIDA" };
  }
  const escolhida = etapa.opcoes[opcao];
  const segura = escolhida.segura === true;
  return {
    ok: true,
    comentario: escolhida.comentario,
    segura,
    proxima: escolhida.proxima,
    fim: segura && escolhida.proxima === null,
    passagem: estado.passagens[etapaId as string],
  };
}

/** `detalhe` do evento como objeto: objeto, texto JSON (jsonb gravado como texto) ou nada. */
function detalheComoObjeto(detalhe: unknown): Record<string, Qualquer> | null {
  if (typeof detalhe === "string") {
    try {
      const lido = JSON.parse(detalhe);
      return ehObjeto(lido) ? lido : null;
    } catch {
      return null;
    }
  }
  return ehObjeto(detalhe) ? detalhe : null;
}

/**
 * As escolhas da rodada ATUAL, a partir dos eventos da trilha desta matrícula e aula, em ordem de gravação.
 * A rodada é a maior de `caso_reiniciado` (o roteiro mudou e o caminho gravado não conferia), ou 1. Só entram os
 * `caso_escolha` dessa rodada, com etapa (texto) e opção (inteiro); o resto é ignorado.
 */
export function escolhasDaRodada(
  eventos: { evento: string; detalhe: unknown }[] | null | undefined
): {
  rodada: number;
  escolhas: EscolhaDoCaso[];
} {
  const lista = Array.isArray(eventos) ? eventos : [];
  let rodada = 1;
  for (const e of lista) {
    if (e?.evento !== "caso_reiniciado") continue;
    const r = detalheComoObjeto(e.detalhe)?.rodada;
    if (Number.isInteger(r) && r > rodada) rodada = r;
  }
  const escolhas: EscolhaDoCaso[] = [];
  for (const e of lista) {
    if (e?.evento !== "caso_escolha") continue;
    const d = detalheComoObjeto(e.detalhe);
    if (!d || d.rodada !== rodada) continue;
    if (typeof d.etapa !== "string" || !Number.isInteger(d.opcao)) continue;
    escolhas.push({ etapa: d.etapa, opcao: d.opcao });
  }
  return { rodada, escolhas };
}
