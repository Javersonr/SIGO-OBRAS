/**
 * Marca do projeto pedagógico que o PDF do curso diz (T25, revisão 1) — pura, sem imports e sem DOM, para o
 * servidor testar a mesma regra (a cópia do servidor está em supabase/functions/portal-funcionario/projeto.ts;
 * `projeto.test.ts` confere que as duas dão o mesmo resultado). Testes em ead-projeto-marca.test.js.
 *
 * Por quê: o requisito PROJETO (Anexo II, 3.1 e 3.3) vale "o PDF do projeto E a validação do responsável
 * técnico". Só que o PDF é um arquivo parado e a validação é uma data no banco: sem uma ligação entre os dois, o
 * RH gerava o PDF para o RT ler (o PDF diz "ainda não foi validado"), registrava a validação em "Salvar curso" e o
 * requisito ficava em ordem, enquanto o aluno e o dossiê da fiscalização abriam o PDF antigo. Mudar qualquer texto
 * depois de gerar o PDF tinha o mesmo efeito.
 *
 * A solução: quem grava o PDF (o botão "Gerar PDF do projeto" ou o anexo próprio) grava junto, em
 * `treinamento_curso.projeto_pdf_marca`, a marca dos 12 campos do projeto como estavam naquele instante. O
 * requisito só fica em ordem enquanto a marca guardada bate com a marca dos campos de hoje: mudou o texto, a
 * validação ou a data de revisão depois do PDF, a marca deixa de bater e o RH é avisado para gerar o PDF de novo.
 *
 * Os 12 campos são os da migração 0141 (os 9 itens escritos pelo RH e os 3 da validação). Fica de fora o que o
 * PDF busca em outras partes (aulas, questões, carga horária, instrutor): mudar isso não derruba a marca.
 *
 * A marca NÃO é segurança: é um detector de mudança (hash de 53 bits, sem chave). Quem pode gravar o curso pode
 * gravar a marca; o que ela impede é o esquecimento, não a fraude.
 */

/** Versão da fórmula: mudar a forma de montar a marca exige trocar este prefixo (marcas antigas deixam de bater). */
export const VERSAO_DA_MARCA = "v1";

const TEXTOS = [
  "objetivo_geral",
  "principios_sst",
  "estrategia_pedagogica",
  "infraestrutura_apoio",
  "publico_alvo",
  "instrumentos_aprendizagem",
];

const aparar = (valor) => String(valor ?? "").trim();

/** Inteiro, ou null (vazio, texto que não é número inteiro, decimal, NaN...). */
function inteiroOuNulo(valor) {
  if (typeof valor === "number") return Number.isInteger(valor) ? valor : null;
  if (typeof valor === "string" && /^\s*-?\d+\s*$/.test(valor)) return Number(valor.trim());
  return null;
}

/** O dia "AAAA-MM-DD" (a coluna `date` já vem assim); o formulário também. */
const dia = (valor) => aparar(valor).slice(0, 10);

/** `modulos_objetivos` é jsonb: uma lista de { modulo, objetivo }; dado vindo do legado pode ser texto. */
function listaDeObjetivos(valor) {
  let v = valor;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const saida = [];
  for (const e of Array.isArray(v) ? v : []) {
    if (!e || typeof e !== "object" || typeof e.objetivo !== "string") continue;
    const objetivo = e.objetivo.trim();
    if (objetivo) saida.push([aparar(e.modulo), objetivo]);
  }
  // a ordem em que a lista foi gravada não muda o que o PDF diz: ordena pelo nome do módulo
  const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return saida.sort((a, b) => comparar(a[0], b[0]) || comparar(a[1], b[1]));
}

/** Os 12 campos do projeto de um curso (ou formulário), na forma canônica que entra na marca. */
export function camposCanonicosDoProjeto(curso) {
  const c = curso ?? {};
  return [
    TEXTOS.map((campo) => aparar(c[campo])),
    [inteiroOuNulo(c.dedicacao_diaria_min), inteiroOuNulo(c.prazo_conclusao_dias)],
    listaDeObjetivos(c.modulos_objetivos),
    [dia(c.projeto_validado_em), aparar(c.projeto_validado_por), dia(c.proxima_revisao)],
  ];
}

// cyrb53 (domínio público): 53 bits a partir de aritmética inteira de 32 bits, igual em qualquer motor de JS
function cyrb53(texto) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * A marca dos 12 campos do projeto: `v1:` e 14 dígitos hexadecimais. Mesmo conteúdo, mesma marca (espaços nas
 * pontas, vazio x nulo e a ordem da lista de módulos não contam); qualquer palavra, número ou data diferente,
 * outra marca.
 */
export function marcaDoProjeto(curso) {
  const hash = cyrb53(JSON.stringify(camposCanonicosDoProjeto(curso)));
  return `${VERSAO_DA_MARCA}:${hash.toString(16).padStart(14, "0")}`;
}

/**
 * O PDF do projeto diante do projeto que está no curso:
 *  - "sem_pdf": o curso não tem PDF do projeto (nenhuma referência);
 *  - "atual": a marca gravada junto com o PDF bate com a marca do projeto de hoje;
 *  - "desatualizado": o projeto (texto, validação ou data de revisão) mudou depois do PDF, ou o PDF foi gravado
 *    sem marca (antes desta regra): é preciso gerar o PDF de novo (ou anexar de novo).
 */
export function estadoDoPdfDoProjeto(curso) {
  if (!aparar(curso?.projeto_pedagogico_ref)) return "sem_pdf";
  return aparar(curso?.projeto_pdf_marca) === marcaDoProjeto(curso) ? "atual" : "desatualizado";
}
