// Regra espelhada no front; requisitos.test.ts confere os mesmos casos.
//
// D3 (Javerson, 06/10/2026): "emitir" é separado de "publicar/matricular". O curso de apoio CONTINUA
// publicado e ACEITA MATRÍCULA como material de estudo; só não emite certificado. Por isso cada
// requisito tem duas chaves: `bloqueia` (impede PUBLICAR e MATRICULAR) e `bloqueiaEmissao` (impede
// EMITIR o certificado). No requisito MODALIDADE, o apoio só tem a segunda; o valor desconhecido, as duas.
//
// D3 completa (A6, 07/10/2026): o apoio é MATERIAL DE ESTUDO, publicado e matriculável sem certificado, então os
// requisitos que só existem por causa do certificado não se aplicam a ele e saem da lista: QUESTOES, LASTRO,
// INSTRUTOR, RT, PROJETO e VALIDADE (o apoio nunca renova). Ficam AULAS, CONTEUDO e CARGA, o aviso do tutor e o
// conteúdo programático, e a MODALIDADE. Só vale para `modalidade === "apoio"`; o front tem a mesma regra
// (lib/ead-requisitos.js) e requisitos.test.ts confere as duas cópias.
//
// T12: o requisito do CURSO (esta lista) é separado da condição da MATRÍCULA. O semipresencial emite como
// modalidade, mas cada aluno só recebe o certificado com a parte prática presencial registrada como
// "presente" e "satisfatória" numa sessão do curso (pratica.ts: 409 PRATICA_PENDENTE). No curso, o
// semipresencial exige a carga teórica (EAD) e a prática (presencial) somando a carga total (requisito
// CARGAS), e o LASTRO mede o conteúdo contra a carga TEÓRICA (C3: a carga total vem do cadastro central e é a
// carga legal do treinamento; a divisão teoria x prática é só do curso EAD, colunas da migração 0143).
// deno-lint-ignore-file no-explicit-any
import { normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";
import { estadoDoPdfDoProjeto } from "./projeto.ts";
export const MIN_QUESTOES = 5;
/**
 * Modalidade do curso (coluna `treinamento_curso.modalidade`, migração 0136; CHECK no banco).
 * `ead` e `semipresencial` emitem certificado; `apoio` é material de estudo do treinamento presencial e
 * nunca emite. No semipresencial, cada aluno ainda depende da prática presencial (T12, pratica.ts).
 */
export const MODALIDADES = ["ead", "semipresencial", "apoio"] as const;
/** A coluna; ausente (curso lido antes da migração 0136) vale "ead". Nome e código NÃO decidem. */
export function modalidadeDoCurso(curso: any): string {
  const m = String(curso?.modalidade ?? "").trim();
  return m === "" ? "ead" : m;
}
/** A modalidade emite certificado? (é o CURSO; no semipresencial cada aluno ainda depende da prática, T12) */
export function emiteCertificado(modalidade: string | null | undefined): boolean {
  const m = modalidade || "ead";
  return m === "ead" || m === "semipresencial";
}
/** Por que a modalidade não emite certificado (para EAD, só o texto neutro do requisito). */
export function motivoSemCertificado(modalidade: string | null | undefined): string {
  const m = modalidade || "ead";
  if (m === "ead") return "Modalidade EAD: emite certificado";
  if (m === "apoio") return "Curso de apoio ao treinamento presencial: não emite certificado";
  if (m === "semipresencial")
    return (
      "Curso semipresencial: o certificado de cada aluno só é emitido com a parte prática " +
      "presencial registrada como satisfatória"
    );
  return "Modalidade do curso não reconhecida: o certificado não pode ser emitido";
}
/**
 * Resposta 409 da emissão pela modalidade, ou null se a modalidade emite. `apoio` tem código próprio (a tela e
 * o roteiro de teste distinguem). O semipresencial passa aqui: a condição dele é da MATRÍCULA (a prática
 * presencial satisfatória, `bloqueioDeEmissaoPorPratica` em pratica.ts, 409 `PRATICA_PENDENTE`).
 */
export function bloqueioDeEmissaoPorModalidade(
  modalidade: string | null | undefined
): { codigo: string; mensagem: string } | null {
  if (emiteCertificado(modalidade)) return null;
  const m = modalidade || "ead";
  const codigo = m === "apoio" ? "CURSO_DE_APOIO" : "MODALIDADE_INVALIDA";
  return { codigo, mensagem: motivoSemCertificado(m) };
}
/** Número de horas (texto ou número); vazio, zero, negativo ou inválido vale 0. */
const horas = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
/** Centésimos de hora: compara somas de decimais sem o erro do ponto flutuante (0,1 + 0,2 = 0,3). */
const centesimos = (valor: unknown): number => Math.round(horas(valor) * 100);
/** Horas com vírgula decimal, como a tela e o certificado escrevem ("1,5 h"); até 2 casas. */
export function formatarHoras(valor: unknown): string {
  const n = Math.round(horas(valor) * 100) / 100;
  return `${String(n).replace(".", ",")} h`;
}
/**
 * Carga que o conteúdo do portal precisa cobrir (LASTRO). No semipresencial é a carga TEÓRICA do curso EAD
 * (`carga_teorica_horas`; sem ela, 0, e o lastro fica pendente); nos outros, a carga total
 * (`carga_horaria_horas`), mesmo que o curso tenha carga teórica gravada (o EAD inteiro é teoria a distância).
 */
export function cargaTeoricaDoCurso(curso: any): number {
  return modalidadeDoCurso(curso) === "semipresencial"
    ? horas(curso?.carga_teorica_horas)
    : horas(curso?.carga_horaria_horas);
}
/** O requisito CARGAS do semipresencial: [ok, texto]. */
function cargasDoSemipresencial(curso: any): [boolean, string] {
  const total = centesimos(curso.carga_horaria_horas);
  const teorica = centesimos(curso.carga_teorica_horas);
  const pratica = centesimos(curso.carga_pratica_horas);
  if (!teorica || !pratica) {
    return [
      false,
      "Informe a carga teórica (EAD) e a carga prática (presencial) do curso semipresencial",
    ];
  }
  if (teorica + pratica !== total) {
    return [
      false,
      `A carga teórica (${formatarHoras(teorica / 100)}) e a prática (${formatarHoras(pratica / 100)}) ` +
        `somam ${formatarHoras((teorica + pratica) / 100)}, diferente da carga horária total ` +
        `(${formatarHoras(total / 100)})`,
    ];
  }
  return [true, "Carga teórica e prática somam a carga horária total"];
}
/** Somente a duração cadastrada pelo RH pode creditar tempo de vídeo. */
export function duracaoParaProgresso(
  aula: { tipo?: string; duracao_seg?: unknown },
  padraoLeitura = 60
) {
  const duracao = Number(aula.duracao_seg);
  if (Number.isFinite(duracao) && duracao > 0) return duracao;
  return !aula.tipo || aula.tipo === "video" ? null : padraoLeitura;
}
/**
 * A modalidade só trava a publicação e a matrícula quando tem um valor que o banco não aceita; o apoio nunca
 * emite e, por isso, não trava (D3). EAD e semipresencial estão sempre em ordem no requisito MODALIDADE.
 */
function modalidadeTravaPublicacao(modalidade: string | null | undefined): boolean {
  return (modalidade || "ead") !== "apoio";
}
export interface Requisito {
  codigo: string;
  ok: boolean;
  /** Pendente impede PUBLICAR o curso e MATRICULAR alunos. */
  bloqueia: boolean;
  /** Pendente impede EMITIR o certificado. */
  bloqueiaEmissao: boolean;
  texto: string;
}
/** Requisitos que impedem PUBLICAR o curso e MATRICULAR alunos (ainda não resolvidos). */
export function pendenciasParaPublicar(requisitos: Requisito[] = []): Requisito[] {
  return requisitos.filter((r) => r.bloqueia && !r.ok);
}
/** Requisitos que impedem EMITIR o certificado (ainda não resolvidos). */
export function pendenciasParaEmitir(requisitos: Requisito[] = []): Requisito[] {
  return requisitos.filter((r) => r.bloqueiaEmissao && !r.ok);
}
export function tempoObrigatorioSeg(aulas: any[] = []) {
  return aulas
    .filter((a) => !a.deleted_at)
    .reduce((total, a) => total + Math.max(0, Number(a.duracao_seg) || 0), 0);
}
// O PDF do projeto foi gerado (ou anexado) com um projeto diferente do que está no curso (T25)
export const TEXTO_PDF_DO_PROJETO_DESATUALIZADO =
  "O PDF do projeto pedagógico está desatualizado: o projeto ou a validação mudaram depois de gerá-lo. Gere o PDF de novo";
export function requisitosDoCurso({
  curso = {},
  aulas = [],
  questoes = [],
}: { curso?: any; aulas?: any[]; questoes?: any[] } = {}): Requisito[] {
  const pdfDoProjeto = estadoDoPdfDoProjeto(curso);
  const ativas = aulas.filter((a) => !a.deleted_at);
  const carga = Number(curso.carga_horaria_horas) || 0;
  const lastro = tempoObrigatorioSeg(ativas);
  // o conteúdo cobre a carga TEÓRICA no semipresencial (T12, C3) e a total nos outros
  const cargaTeorica = cargaTeoricaDoCurso(curso);
  const arquivo = (a: any) =>
    a.tipo === "pdf"
      ? a.arquivo_ref
      : a.tipo === "texto"
        ? a.conteudo_texto?.trim()
        : a.fonte === "upload"
          ? a.video_ref
          : a.youtube_id;
  const modalidade = modalidadeDoCurso(curso);
  const semipresencial = modalidade === "semipresencial";
  // D3 completa: o apoio só estuda, não certifica (ver o cabeçalho). Só "apoio": o valor desconhecido segue completo.
  const soEstudo = modalidade === "apoio";
  const itens: [string, boolean, string][] = [
    ["AULAS", ativas.length > 0, "Adicione pelo menos uma aula"],
    [
      "CONTEUDO",
      ativas.length > 0 && ativas.every((a) => arquivo(a) && Number(a.duracao_seg) > 0),
      "Todas as aulas precisam de conteúdo e duração cadastrada",
    ],
    ...(soEstudo
      ? []
      : ([
          [
            "QUESTOES",
            questoes.filter((q) => !q.deleted_at).length >= MIN_QUESTOES,
            `Cadastre pelo menos ${MIN_QUESTOES} questões`,
          ],
        ] as [string, boolean, string][])),
    ["CARGA", carga > 0, "Defina a carga horária"],
    // só o semipresencial: carga teórica + prática = carga total (T12)
    ...(semipresencial
      ? [["CARGAS", ...cargasDoSemipresencial(curso)] as [string, boolean, string]]
      : []),
    ...(soEstudo
      ? []
      : ([
          [
            "LASTRO",
            cargaTeorica > 0 && cargaTeorica * 3600 <= lastro,
            semipresencial
              ? "O conteúdo cadastrado não cobre a carga teórica (EAD) declarada"
              : "O conteúdo cadastrado não cobre a carga horária declarada",
          ],
          ["INSTRUTOR", !!curso.instrutor_nome?.trim(), "Informe o instrutor"],
          ["RT", !!curso.responsavel_tecnico_nome?.trim(), "Informe o responsável técnico"],
        ] as [string, boolean, string][])),
    ["MODALIDADE", emiteCertificado(modalidade), motivoSemCertificado(modalidade)],
  ];
  return [
    ...itens.map(([codigo, ok, texto]) => ({
      codigo,
      ok,
      // D3: o apoio não trava publicar nem matricular, só a emissão (o motivo é só informativo)
      bloqueia: codigo === "MODALIDADE" ? modalidadeTravaPublicacao(modalidade) : true,
      bloqueiaEmissao: true,
      texto,
    })),
    ...(
      [
        // T21 (D4): o aviso só some com um WhatsApp que o envio aceita (a mesma regra de normalizarTelefoneBR);
        // nome e atendimento do tutor são opcionais. Nunca trava publicar nem emitir.
        [
          "TUTOR",
          normalizarTelefoneBR(curso.tutor_telefone),
          "Defina o WhatsApp do tutor (número válido, com DDD)",
        ],
        // T25: o projeto pedagógico (Anexo II, 3.1) só está em ordem com o PDF gerado ou anexado E a validação do
        // responsável técnico registrada (3.3), e com o PDF que diz o mesmo que o projeto de hoje: a marca gravada
        // junto com o PDF tem de bater com a dos campos do curso (projeto.ts). Mudou o texto ou a validação
        // depois do PDF: gerar de novo. É aviso: virar bloqueio de publicação é decisão do Javerson.
        // (o apoio não tem projeto pedagógico de EAD com certificado nem validade: D3 completa)
        ...(soEstudo
          ? []
          : ([
              [
                "PROJETO",
                pdfDoProjeto === "atual" && curso.projeto_validado_em,
                pdfDoProjeto === "desatualizado" && curso.projeto_validado_em
                  ? TEXTO_PDF_DO_PROJETO_DESATUALIZADO
                  : "Complete o projeto pedagógico (15 itens), gere o PDF e registre a validação do responsável técnico",
              ],
            ] as [string, unknown, string][])),
        ["PROGRAMA", curso.conteudo_programatico, "Preencha o conteúdo programático"],
        ...(soEstudo
          ? []
          : ([["VALIDADE", curso.validade_meses, "Confira a validade do treinamento"]] as [
              string,
              unknown,
              string,
            ][])),
      ] as [string, unknown, string][]
    ).map(([codigo, valor, texto]) => ({
      codigo,
      ok: !!valor,
      bloqueia: false,
      bloqueiaEmissao: false,
      texto,
    })),
  ];
}
