// com a extensão: o teste do servidor (node:test) importa este arquivo direto, sem o resolvedor do Vite
import { normalizarTelefoneBR } from "./telefone.js";
import { estadoDoPdfDoProjeto } from "./ead-projeto-marca.js";
export const MIN_QUESTOES = 5;
// Modalidade do curso (coluna treinamento_curso.modalidade, migração 0136). Só "ead" emite certificado:
// "apoio" é material de estudo do treinamento presencial (nunca emite) e "semipresencial" só passa a
// emitir quando a etapa prática for registrada (T12). Espelho do servidor (portal-funcionario/
// requisitos.ts); requisitos.test.ts confere que os dois dizem a mesma coisa.
//
// D3 (Javerson, 06/10/2026): "emitir" é separado de "publicar/matricular". O curso de apoio CONTINUA
// publicado e ACEITA MATRÍCULA como material de estudo; só não emite certificado. Por isso cada
// requisito tem duas chaves: `bloqueia` (impede PUBLICAR e MATRICULAR) e `bloqueiaEmissao` (impede
// EMITIR o certificado). No requisito MODALIDADE, o apoio só tem a segunda; o semipresencial (e o valor
// desconhecido) têm as duas, como a T8 deixou, até a T12.
export const MODALIDADES = ["ead", "semipresencial", "apoio"];
// A coluna; curso sem ela (lido antes da migração) vale "ead". Nome e código NÃO decidem.
export function modalidadeDoCurso(curso) {
  const m = String(curso?.modalidade ?? "").trim();
  return m === "" ? "ead" : m;
}
export function emiteCertificado(modalidade) {
  return (modalidade || "ead") === "ead";
}
export function motivoSemCertificado(modalidade) {
  const m = modalidade || "ead";
  if (m === "ead") return "Modalidade EAD: emite certificado";
  if (m === "apoio") return "Curso de apoio ao treinamento presencial: não emite certificado";
  if (m === "semipresencial")
    return (
      "Curso semipresencial: o certificado só poderá ser emitido depois do registro da " +
      "prática presencial (ainda não disponível)"
    );
  return "Modalidade do curso não reconhecida: o certificado não pode ser emitido";
}
// A modalidade só trava a publicação e a matrícula quando o curso AINDA PODERÁ emitir (semipresencial, na
// T12) ou tem um valor que o banco não aceita; o apoio nunca emite e, por isso, não trava (D3).
function modalidadeTravaPublicacao(modalidade) {
  return (modalidade || "ead") !== "apoio";
}
/** Requisitos que impedem PUBLICAR o curso e MATRICULAR alunos (ainda não resolvidos). */
export function pendenciasParaPublicar(requisitos = []) {
  return requisitos.filter((r) => r.bloqueia && !r.ok);
}
/** Requisitos que impedem EMITIR o certificado (ainda não resolvidos). */
export function pendenciasParaEmitir(requisitos = []) {
  return requisitos.filter((r) => r.bloqueiaEmissao && !r.ok);
}
export function tempoObrigatorioSeg(aulas = []) {
  return aulas
    .filter((a) => !a.deleted_at)
    .reduce((total, a) => total + Math.max(0, Number(a.duracao_seg) || 0), 0);
}
// O PDF do projeto foi gerado (ou anexado) com um projeto diferente do que está no curso (T25)
export const TEXTO_PDF_DO_PROJETO_DESATUALIZADO =
  "O PDF do projeto pedagógico está desatualizado: o projeto ou a validação mudaram depois de gerá-lo. Gere o PDF de novo";
export function requisitosDoCurso({ curso = {}, aulas = [], questoes = [] } = {}) {
  const pdfDoProjeto = estadoDoPdfDoProjeto(curso);
  const ativas = aulas.filter((a) => !a.deleted_at);
  const carga = Number(curso.carga_horaria_horas) || 0;
  const lastro = tempoObrigatorioSeg(ativas);
  const arquivo = (a) =>
    a.tipo === "pdf"
      ? a.arquivo_ref
      : a.tipo === "texto"
        ? a.conteudo_texto?.trim()
        : a.fonte === "upload"
          ? a.video_ref
          : a.youtube_id;
  const modalidade = modalidadeDoCurso(curso);
  const itens = [
    ["AULAS", ativas.length > 0, "Adicione pelo menos uma aula"],
    [
      "CONTEUDO",
      ativas.length > 0 && ativas.every((a) => arquivo(a) && Number(a.duracao_seg) > 0),
      "Todas as aulas precisam de conteúdo e duração cadastrada",
    ],
    [
      "QUESTOES",
      questoes.filter((q) => !q.deleted_at).length >= MIN_QUESTOES,
      `Cadastre pelo menos ${MIN_QUESTOES} questões`,
    ],
    ["CARGA", carga > 0, "Defina a carga horária"],
    [
      "LASTRO",
      carga > 0 && carga * 3600 <= lastro,
      "O conteúdo cadastrado não cobre a carga horária declarada",
    ],
    ["INSTRUTOR", !!curso.instrutor_nome?.trim(), "Informe o instrutor"],
    ["RT", !!curso.responsavel_tecnico_nome?.trim(), "Informe o responsável técnico"],
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
    ...[
      // T21 (D4): o aviso só some com um WhatsApp que o servidor aceita enviar (a mesma regra do envio);
      // nome e atendimento do tutor são opcionais e não entram aqui. Nunca trava publicar nem emitir.
      [
        "TUTOR",
        normalizarTelefoneBR(curso.tutor_telefone),
        "Defina o WhatsApp do tutor (número válido, com DDD)",
      ],
      // T25: o projeto pedagógico (Anexo II, 3.1) só está em ordem com o PDF gerado ou anexado E a validação do
      // responsável técnico registrada (3.3), e com o PDF que diz o mesmo que o projeto de hoje: a marca gravada
      // junto com o PDF tem de bater com a dos campos do curso (lib ead-projeto-marca.js). Mudou o texto ou a
      // validação depois do PDF: gerar de novo. É aviso: virar bloqueio de publicação é decisão do Javerson.
      [
        "PROJETO",
        pdfDoProjeto === "atual" && curso.projeto_validado_em,
        pdfDoProjeto === "desatualizado" && curso.projeto_validado_em
          ? TEXTO_PDF_DO_PROJETO_DESATUALIZADO
          : "Complete o projeto pedagógico (15 itens), gere o PDF e registre a validação do responsável técnico",
      ],
      ["PROGRAMA", curso.conteudo_programatico, "Preencha o conteúdo programático"],
      ["VALIDADE", curso.validade_meses, "Confira a validade do treinamento"],
    ].map(([codigo, valor, texto]) => ({
      codigo,
      ok: !!valor,
      bloqueia: false,
      bloqueiaEmissao: false,
      texto,
    })),
  ];
}
