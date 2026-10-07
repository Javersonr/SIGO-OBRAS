// Projeto pedagógico do curso no portal (T25; NR-1, Anexo II, 3.1 itens j e k). Regra pura, sem `Deno.*` nem
// rede: o `index.ts` liga o banco. Teste em projeto.test.ts.
//
// O curso guarda o projeto inteiro em colunas próprias (migração 0141), mas o ALUNO só recebe o que precisa para
// se organizar: o prazo para concluir (`prazo_conclusao_dias`, em dias a partir da matrícula) e a estimativa de
// dedicação diária (`dedicacao_diaria_min`). O texto do projeto (objetivo, estratégia, validação...) chega ao
// aluno só dentro do PDF do projeto, que ele abre pelo botão "Projeto pedagógico".
// deno-lint-ignore-file no-explicit-any

/** Prazo máximo e dedicação máxima aceitos (iguais ao CHECK da migração 0141 e à tela do RH). */
export const MAX_PRAZO_CONCLUSAO_DIAS = 3650;
export const MAX_DEDICACAO_DIARIA_MIN = 1440;

function inteiroNoLimite(valor: unknown, maximo: number): number | null {
  const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= maximo ? n : null;
}

/** O que o aluno recebe do projeto em `dados`: prazo e dedicação (inteiro válido ou null). Nada mais. */
export function projetoParaOAluno(
  curso: { prazo_conclusao_dias?: unknown; dedicacao_diaria_min?: unknown } | null | undefined
): { prazo_conclusao_dias: number | null; dedicacao_diaria_min: number | null } {
  return {
    prazo_conclusao_dias: inteiroNoLimite(curso?.prazo_conclusao_dias, MAX_PRAZO_CONCLUSAO_DIAS),
    dedicacao_diaria_min: inteiroNoLimite(curso?.dedicacao_diaria_min, MAX_DEDICACAO_DIARIA_MIN),
  };
}

// ------------------------------------------------------------------------------------ marca do PDF do projeto
// Cópia da regra de apps/web/src/lib/ead-projeto-marca.js (o servidor não importa o front: o deploy só leva
// supabase/functions). O teste projeto.test.ts confere que as duas dão a MESMA marca nos mesmos casos.
//
// Por quê: o requisito PROJETO só fica em ordem com o PDF do projeto E a validação do responsável técnico. O PDF é um
// arquivo parado e a validação é uma data no banco; sem ligação entre os dois, o PDF que o aluno abre (e o que vai
// no dossiê da fiscalização) podia ser um rascunho anterior à validação. Quem grava o PDF grava junto, em
// `treinamento_curso.projeto_pdf_marca`, a marca dos 12 campos do projeto daquele instante; o requisito só vale
// enquanto a marca guardada bate com a dos campos de hoje. A marca é um detector de mudança, não segurança.

/** Versão da fórmula: mudar a forma de montar a marca exige trocar este prefixo. */
export const VERSAO_DA_MARCA = "v1";

const TEXTOS_DO_PROJETO = [
  "objetivo_geral",
  "principios_sst",
  "estrategia_pedagogica",
  "infraestrutura_apoio",
  "publico_alvo",
  "instrumentos_aprendizagem",
] as const;

const aparar = (valor: unknown): string => String(valor ?? "").trim();

function inteiroOuNulo(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isInteger(valor) ? valor : null;
  if (typeof valor === "string" && /^\s*-?\d+\s*$/.test(valor)) return Number(valor.trim());
  return null;
}

const dia = (valor: unknown): string => aparar(valor).slice(0, 10);

function listaDeObjetivos(valor: unknown): [string, string][] {
  let v: unknown = valor;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const saida: [string, string][] = [];
  for (const e of Array.isArray(v) ? v : []) {
    if (!e || typeof e !== "object" || typeof (e as any).objetivo !== "string") continue;
    const objetivo = (e as any).objetivo.trim();
    if (objetivo) saida.push([aparar((e as any).modulo), objetivo]);
  }
  const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return saida.sort((a, b) => comparar(a[0], b[0]) || comparar(a[1], b[1]));
}

/** Os 12 campos do projeto de um curso, na forma canônica que entra na marca. */
export function camposCanonicosDoProjeto(curso: any): unknown[] {
  const c = curso ?? {};
  return [
    TEXTOS_DO_PROJETO.map((campo) => aparar(c[campo])),
    [inteiroOuNulo(c.dedicacao_diaria_min), inteiroOuNulo(c.prazo_conclusao_dias)],
    listaDeObjetivos(c.modulos_objetivos),
    [dia(c.projeto_validado_em), aparar(c.projeto_validado_por), dia(c.proxima_revisao)],
  ];
}

// cyrb53 (domínio público): 53 bits a partir de aritmética inteira de 32 bits, igual em qualquer motor de JS
function cyrb53(texto: string): number {
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

/** A marca dos 12 campos do projeto: `v1:` e 14 dígitos hexadecimais. */
export function marcaDoProjeto(curso: any): string {
  const hash = cyrb53(JSON.stringify(camposCanonicosDoProjeto(curso)));
  return `${VERSAO_DA_MARCA}:${hash.toString(16).padStart(14, "0")}`;
}

/**
 * O PDF do projeto diante do projeto do curso: "sem_pdf" (sem referência), "atual" (a marca gravada com o PDF bate
 * com a dos campos de hoje) ou "desatualizado" (o projeto mudou depois do PDF, ou o PDF foi gravado sem marca).
 */
export function estadoDoPdfDoProjeto(curso: any): "sem_pdf" | "atual" | "desatualizado" {
  if (!aparar(curso?.projeto_pedagogico_ref)) return "sem_pdf";
  return aparar(curso?.projeto_pdf_marca) === marcaDoProjeto(curso) ? "atual" : "desatualizado";
}
