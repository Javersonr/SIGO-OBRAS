/**
 * Dossiê de fiscalização do curso EAD e certificado na Ficha do funcionário (T34) — regras puras, sem DOM
 * e sem rede: os dados e os arquivos entram por parâmetro. Os testes ficam em ead-dossie.test.js.
 *
 * NR-1, itens 1.6.5 (acesso amplo da Inspeção do Trabalho aos registros), 1.7.4 (capacitação consignada nos
 * documentos funcionais) e Anexo II, 4.1 (projeto pedagógico à disposição da fiscalização).
 *
 * O dossiê de um curso é um ZIP com: o projeto pedagógico (PDF anexado ao curso), a planilha de matrículas,
 * a trilha de auditoria de todas as matrículas, as tentativas da prova com as respostas e o PDF de cada
 * certificado, mais um LEIA-ME que explica o pacote e lista o que NÃO entrou. Nada falta em silêncio: projeto
 * ausente, certificado que não gerou e leitura cortada viram aviso (no LEIA-ME e no toast).
 *
 * Quem usa: components/seguranca/exportarDossieEad.js (lê o banco e baixa o ZIP), TreinamentosEadTab.jsx
 * (botão "Exportar dossiê") e FichaFuncionarioSheet.jsx (`certificadoDaFicha`).
 */
import { celulaDoCsv, diaEmBrasilia, nomeDoFuncionario, rotuloDoStatus } from "./ead-matriculas";
import { dataHoraBrasilia } from "./data-brasilia";
import { detalharTentativa } from "./ead-tentativa";
import { descreverDetalhe, formatarTempo, origemDoEvento, rotuloDoEvento } from "./ead-trilha";
import { modalidadeDoCurso } from "./ead-requisitos";
import { textoDoTipoDaMatricula } from "./ead-tipo-matricula";
import { numerarAulas, renovacaoParaExibir } from "./portal-curso";
import { ehBase44, extensaoDoArquivo } from "./anexo-ref";

/** Marca de UTF-8 no começo dos arquivos de texto: o Excel e o Bloco de Notas acertam os acentos. */
export const BOM = "\uFEFF";

const CRLF = "\r\n";
const LIMITE_DO_NOME = 60;
const COLADOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

// ------------------------------------------------------------------------------------------ pequenos

const lista = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const textoOuVazio = (v) => (v === null || v === undefined ? "" : String(v));
const umaLinha = (v) =>
  textoOuVazio(v)
    .replace(/\s*\r?\n\s*/g, " ")
    .trim();
const mapaPorId = (itens) => new Map(lista(itens).map((i) => [i.id, i]));

/** "AAAA-MM-DD..." → "dd/mm/aaaa"; vazio ou ilegível → "". */
const dataBR = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(textoOuVazio(d));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
/** Instante → "dd/mm/aaaa hh:mm:ss" no fuso de Brasília (sem a vírgula do locale, que atrapalha a planilha). */
const horaBR = (v) => {
  const texto = dataHoraBrasilia(v);
  return texto === "—" ? "" : texto.replace(/,\s*/, " ");
};
/** Instante → ISO em UTC ("2026-09-10T15:30:00.000Z"); vazio ou ilegível → "". */
const isoUtc = (v) => {
  if (v === null || v === undefined || v === "") return "";
  const data = new Date(v);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString();
};
const numeroOuNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const notaBR = (n) => (n === null ? "" : String(Number(n.toFixed(1))).replace(".", ","));

/** CPF com pontos e traço quando tem 11 dígitos; nos outros casos, como veio ("" se não há). */
export function cpfFormatado(cpf) {
  const bruto = textoOuVazio(cpf).trim();
  const d = bruto.replace(/\D/g, "");
  return d.length === 11
    ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    : bruto;
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

// ------------------------------------------------------------------------------------ nomes de arquivo

/**
 * Nome seguro para entrada de ZIP: só letras e números (acentos ficam), o resto vira "_". Barra, ponto e
 * dois-pontos não escapam da pasta; nada sobrando devolve `padrao`; corta em `max` caracteres.
 */
export function nomeSeguroDeArquivo(texto, padrao = "arquivo", max = LIMITE_DO_NOME) {
  const limpo = textoOuVazio(texto)
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max)
    .replace(/_+$/g, "");
  return limpo || padrao;
}

/** Nome do ZIP: o código do curso (ou o nome) e o dia de Brasília em que foi gerado. */
export function nomeDoZip(curso, geradoEm) {
  const base = nomeSeguroDeArquivo(curso?.codigo || curso?.nome, "curso");
  return `dossie_ead_${base}_${diaEmBrasilia(geradoEm) ?? "sem-data"}.zip`;
}

// ---------------------------------------------------------------------------------------------- aulas

const porOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0);

/**
 * Rótulo de cada aula pelo id: "2. Título" para as que existem (a mesma numeração que o aluno e o RH
 * veem) e "Título (aula removida)" para as removidas, que a trilha ainda cita. `vivas` vem em ordem.
 */
function rotulosDasAulas(aulas) {
  const todas = lista(aulas);
  const vivas = todas.filter((a) => !a.deleted_at).sort(porOrdem);
  const rotulos = new Map();
  for (const a of numerarAulas(vivas)) {
    rotulos.set(a.id, `${a.numero}. ${a.titulo || "(sem título)"}`);
  }
  for (const a of todas) {
    if (a.deleted_at) rotulos.set(a.id, `${a.titulo || "(sem título)"} (aula removida)`);
  }
  return { rotulos, vivas };
}

// ----------------------------------------------------------------------------------------------- CSV

/** Texto do CSV: separador ";" (o Excel em português), quebra CRLF, células protegidas de fórmula. */
function montarCsv(titulos, linhas) {
  return [titulos, ...linhas].map((l) => l.map((c) => celulaDoCsv(c)).join(";")).join(CRLF);
}

const iguais = (a, b) => (a === b ? 0 : a < b ? -1 : 1);

function porHoraEId(a, b) {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
  const na = Number(a.id);
  const nb = Number(b.id);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return iguais(textoOuVazio(a.id), textoOuVazio(b.id));
}

/**
 * Os eventos que entram na trilha do dossiê: os das matrículas do curso (inclusive as removidas) e os
 * acessos ao portal (login, troca de senha...: eventos sem matrícula) de quem tem matrícula nele. Evento de
 * outra matrícula do mesmo funcionário fica de fora. Sem repetição (o mesmo evento pode vir de duas
 * consultas), em ordem de hora do servidor e, no empate, de id.
 */
export function eventosDoCurso({ eventos, matriculas } = {}) {
  const mats = lista(matriculas);
  const idsDasMatriculas = new Set(mats.map((m) => m.id));
  const idsDosFuncionarios = new Set(mats.map((m) => m.funcionario_id));
  const vistos = new Set();
  const doCurso = [];
  for (const e of lista(eventos)) {
    const pertence = e.matricula_id
      ? idsDasMatriculas.has(e.matricula_id)
      : idsDosFuncionarios.has(e.funcionario_id);
    if (!pertence) continue;
    if (e.id !== undefined && e.id !== null) {
      if (vistos.has(e.id)) continue;
      vistos.add(e.id);
    }
    doCurso.push(e);
  }
  return doCurso.sort(porHoraEId);
}

const TITULOS_DA_TRILHA = [
  "Data e hora (Brasília)",
  "Data e hora (UTC)",
  "Funcionário",
  "CPF",
  "Escopo",
  "Evento (código)",
  "Descrição",
  "Aula",
  "Detalhe",
  "Detalhe (JSON)",
  "IP",
  "Dispositivo",
  "Origem",
  "Matrícula",
];

/**
 * Trilha de auditoria de todas as matrículas do curso, uma linha por evento, na ordem recebida (use
 * `eventosDoCurso`). Hora do servidor em Brasília e em UTC, quem, IP, aparelho e a origem do evento
 * ("navegador" = o navegador do aluno informou; "servidor" = o servidor viu e decidiu; vazio = não consta).
 */
export function csvDaTrilha({ eventos, matriculas, funcionarios, aulas } = {}) {
  const funcs = mapaPorId(funcionarios);
  const idsDasMatriculas = new Set(lista(matriculas).map((m) => m.id));
  const { rotulos } = rotulosDasAulas(aulas);
  const linhas = lista(eventos).map((e) => {
    const f = funcs.get(e.funcionario_id);
    return [
      horaBR(e.created_at),
      isoUtc(e.created_at),
      nomeDoFuncionario(f),
      cpfFormatado(f?.cpf),
      e.matricula_id && idsDasMatriculas.has(e.matricula_id)
        ? "Matrícula do curso"
        : "Acesso ao portal",
      textoOuVazio(e.evento),
      rotuloDoEvento(e.evento),
      e.aula_id ? (rotulos.get(e.aula_id) ?? e.aula_id) : "",
      descreverDetalhe(e),
      e.detalhe ? JSON.stringify(e.detalhe) : "",
      textoOuVazio(e.ip),
      textoOuVazio(e.dispositivo),
      origemDoEvento(e),
      textoOuVazio(e.matricula_id),
    ];
  });
  return montarCsv(TITULOS_DA_TRILHA, linhas);
}

const TITULOS_DAS_MATRICULAS = [
  "Funcionário",
  "CPF",
  "Função",
  "Status",
  "Tipo de treinamento",
  "Aulas concluídas",
  "Total de aulas",
  "Tempo assistido",
  "Nota (%)",
  "Aprovado",
  "Tentativas feitas",
  "Tentativas extras liberadas",
  "Matriculado em",
  "Início do curso (Brasília)",
  "Concluído em",
  "Renovar até",
  "Certificado (código)",
  "Situação do certificado",
  "Emitido em (Brasília)",
  "Revogado em (Brasília)",
  "Motivo da revogação",
  "Matrícula removida em",
  "ID da matrícula",
];

/** Agrupa as linhas pela chave `campo` (matricula_id): Map(chave → linhas). */
function agruparPor(linhas, campo) {
  const grupos = new Map();
  for (const l of lista(linhas)) {
    const atual = grupos.get(l[campo]) ?? [];
    atual.push(l);
    grupos.set(l[campo], atual);
  }
  return grupos;
}

/**
 * Planilha de matrículas do curso, uma linha por matrícula, inclusive as removidas (a coluna "Matrícula
 * removida em" diz quais: a exclusão é lógica e o registro segue valendo para a fiscalização). Em ordem de
 * nome e data da matrícula. "Aulas concluídas" conta só as aulas que ainda existem; "Tempo assistido" soma
 * todo o tempo registrado.
 */
export function csvDasMatriculas({
  matriculas,
  curso,
  funcionarios,
  aulas,
  progresso,
  tentativas,
  certificados,
} = {}) {
  const funcs = mapaPorId(funcionarios);
  const { vivas } = rotulosDasAulas(aulas);
  const idsDasAulas = new Set(vivas.map((a) => a.id));
  const progressoPorMatricula = agruparPor(progresso, "matricula_id");
  const tentativasPorMatricula = agruparPor(tentativas, "matricula_id");
  const certificadoPorMatricula = new Map();
  for (const c of lista(certificados)) {
    if (c.matricula_id && !certificadoPorMatricula.has(c.matricula_id)) {
      certificadoPorMatricula.set(c.matricula_id, c);
    }
  }
  const apoio = modalidadeDoCurso(curso) === "apoio";
  const nomeDe = (m) => nomeDoFuncionario(funcs.get(m.funcionario_id));
  const ordenadas = lista(matriculas).sort(
    (a, b) =>
      COLADOR.compare(nomeDe(a), nomeDe(b)) ||
      iguais(textoOuVazio(a.created_at), textoOuVazio(b.created_at)) ||
      iguais(textoOuVazio(a.id), textoOuVazio(b.id))
  );

  const linhas = ordenadas.map((m) => {
    const f = funcs.get(m.funcionario_id);
    const feitas = progressoPorMatricula.get(m.id) ?? [];
    const concluidas = new Set(
      feitas.filter((p) => p.concluida && idsDasAulas.has(p.aula_id)).map((p) => p.aula_id)
    );
    const segundos = feitas.reduce((s, p) => s + (Number(p.segundos_assistidos) || 0), 0);
    const suasTentativas = tentativasPorMatricula.get(m.id) ?? [];
    const ultima = suasTentativas.reduce(
      (a, t) => (!a || Number(t.numero) > Number(a.numero) ? t : a),
      null
    );
    const nota = numeroOuNull(m.nota_avaliacao) ?? numeroOuNull(ultima?.nota);
    const certificado = apoio ? null : (certificadoPorMatricula.get(m.id) ?? null);
    let situacao = "Ainda sem certificado";
    if (apoio) situacao = "Não emite certificado";
    else if (certificado) situacao = certificado.revogado_em ? "Revogado" : "Emitido";
    return [
      nomeDoFuncionario(f),
      cpfFormatado(f?.cpf),
      textoOuVazio(f?.funcao_nome),
      rotuloDoStatus(m.status),
      // inicial, periódico ou eventual com o motivo (T23, NR-1 1.7.1.2); vazio antes da migração 0142
      textoDoTipoDaMatricula(m),
      concluidas.size,
      idsDasAulas.size,
      formatarTempo(segundos),
      notaBR(nota),
      typeof m.avaliacao_aprovada === "boolean" ? (m.avaliacao_aprovada ? "Sim" : "Não") : "",
      suasTentativas.length,
      Math.max(0, Number(m.tentativas_extras) || 0),
      dataBR(diaEmBrasilia(m.created_at)),
      horaBR(m.iniciado_em),
      dataBR(m.data_conclusao),
      dataBR(renovacaoParaExibir(curso, m)),
      textoOuVazio(certificado?.codigo),
      situacao,
      horaBR(certificado?.emitido_em),
      horaBR(certificado?.revogado_em),
      textoOuVazio(certificado?.motivo_revogacao),
      m.deleted_at ? dataBR(diaEmBrasilia(m.deleted_at)) : "",
      textoOuVazio(m.id),
    ];
  });
  return montarCsv(TITULOS_DAS_MATRICULAS, linhas);
}

const TITULOS_DAS_TENTATIVAS = [
  "Funcionário",
  "CPF",
  "Tentativa",
  "Data e hora (Brasília)",
  "Data e hora (UTC)",
  "Nota (%)",
  "Acertos",
  "Total de questões",
  "Resultado",
  "IP",
  "Dispositivo",
  "Posição na prova",
  "Pergunta",
  "Alternativa marcada",
  "Alternativa correta",
  "Resultado da questão",
  "Ordem das alternativas",
  "Matrícula",
];

const RESULTADO_DA_QUESTAO = { acertou: "Acertou", errou: "Errou", sem_resposta: "Sem resposta" };
const SEM_PROVA_GRAVADA = "Prova não gravada nesta tentativa";

const alternativaTexto = (a) => (a ? `${a.letra}) ${a.texto}` : "");

/**
 * Tentativas da prova com as respostas: uma linha por questão de cada tentativa, na ordem em que o aluno viu
 * a prova, com a alternativa marcada e a correta pela letra que ele viu. Os dados da tentativa (nota, IP,
 * hora) se repetem em cada linha. Tentativa sem a prova gravada sai em uma linha só, com o resultado: ela
 * nunca some. Em ordem de nome, matrícula e número da tentativa.
 */
export function csvDasTentativas({ tentativas, matriculas, funcionarios } = {}) {
  const funcs = mapaPorId(funcionarios);
  const matriculaPorId = mapaPorId(matriculas);
  const nomeDe = (t) =>
    nomeDoFuncionario(
      funcs.get(t.funcionario_id ?? matriculaPorId.get(t.matricula_id)?.funcionario_id)
    );
  const ordenadas = lista(tentativas).sort(
    (a, b) =>
      COLADOR.compare(nomeDe(a), nomeDe(b)) ||
      iguais(
        textoOuVazio(matriculaPorId.get(a.matricula_id)?.created_at),
        textoOuVazio(matriculaPorId.get(b.matricula_id)?.created_at)
      ) ||
      iguais(textoOuVazio(a.matricula_id), textoOuVazio(b.matricula_id)) ||
      (Number(a.numero) || 0) - (Number(b.numero) || 0)
  );

  const linhas = [];
  for (const t of ordenadas) {
    const funcionario = funcs.get(
      t.funcionario_id ?? matriculaPorId.get(t.matricula_id)?.funcionario_id
    );
    const inicio = [
      nomeDoFuncionario(funcionario),
      cpfFormatado(funcionario?.cpf),
      textoOuVazio(t.numero),
      horaBR(t.created_at),
      isoUtc(t.created_at),
      notaBR(numeroOuNull(t.nota)),
      textoOuVazio(t.acertos),
      textoOuVazio(t.total),
      t.aprovada === true ? "Aprovado" : t.aprovada === false ? "Reprovado" : "",
      textoOuVazio(t.ip),
      textoOuVazio(t.dispositivo),
    ];
    const fim = [textoOuVazio(t.matricula_id)];
    const detalhe = detalharTentativa(t);
    if (!detalhe.temDetalhe) {
      linhas.push([...inicio, "", "", "", "", SEM_PROVA_GRAVADA, "", ...fim]);
      continue;
    }
    for (const q of detalhe.questoes) {
      const marcada = q.alternativas.find((a) => a.marcada);
      const correta = q.alternativas.find((a) => a.correta);
      linhas.push([
        ...inicio,
        q.posicao ?? "",
        q.pergunta,
        marcada ? alternativaTexto(marcada) : "(sem resposta)",
        alternativaTexto(correta),
        RESULTADO_DA_QUESTAO[q.status] ?? "",
        q.ordemRegistrada ? "Como o aluno viu" : "Ordem do cadastro (não registrada)",
        ...fim,
      ]);
    }
  }
  return montarCsv(TITULOS_DAS_TENTATIVAS, linhas);
}

// ------------------------------------------------------------------------------------- certificados

/**
 * Os certificados que entram no dossiê: os do curso (um de outro curso nunca entra), em ordem de nome e
 * data de emissão. Os revogados entram (saem marcados no PDF e no nome do arquivo). Curso de APOIO não leva
 * nenhum, mesmo que haja um gravado (D3: o apoio não emite certificado): `omitidos` diz isso.
 */
export function certificadosDoDossie({ curso, certificados, funcionarios } = {}) {
  if (modalidadeDoCurso(curso) === "apoio") return { certificados: [], omitidos: true };
  const funcs = mapaPorId(funcionarios);
  const nomeDe = (c) =>
    funcs.get(c.funcionario_id)?.nome_completo || textoOuVazio(c.dados?.aluno?.nome);
  const doCurso = lista(certificados)
    .filter((c) => curso?.id && c.curso_id === curso.id)
    .sort(
      (a, b) =>
        COLADOR.compare(nomeDe(a), nomeDe(b)) ||
        iguais(textoOuVazio(a.emitido_em), textoOuVazio(b.emitido_em))
    );
  return { certificados: doCurso, omitidos: false };
}

/**
 * Nome do PDF do certificado dentro do ZIP: "Certificado_<aluno>_<código>[_REVOGADO].pdf". `usados` guarda
 * os nomes já tomados (sem diferenciar maiúsculas, como o Windows): um nome repetido ganha "_2", "_3"...
 */
export function nomeDoCertificadoNoZip(cert, usados = new Set()) {
  const partes = [
    "Certificado",
    nomeSeguroDeArquivo(cert?.dados?.aluno?.nome, ""),
    nomeSeguroDeArquivo(cert?.codigo, "sem_codigo"),
  ].filter(Boolean);
  const base = partes.join("_") + (cert?.revogado_em ? "_REVOGADO" : "");
  let nome = `${base}.pdf`;
  for (let n = 2; usados.has(nome.toLowerCase()); n += 1) nome = `${base}_${n}.pdf`;
  usados.add(nome.toLowerCase());
  return nome;
}

/**
 * O certificado que a Ficha do funcionário oferece para baixar na linha de um curso: `{ certificado,
 * revogado }` ou null. Curso de APOIO não mostra certificado (D3), nem que haja um gravado. Revogado
 * continua baixável (o PDF sai marcado "CERTIFICADO REVOGADO"). Curso que já não existe no cadastro não
 * esconde o certificado emitido.
 */
export function certificadoDaFicha({ curso, matricula, certificados } = {}) {
  if (!matricula || modalidadeDoCurso(curso) === "apoio") return null;
  const certificado = lista(certificados).find((c) => c.matricula_id === matricula.id);
  if (!certificado) return null;
  return { certificado, revogado: !!certificado.revogado_em };
}

// ---------------------------------------------------------------------------------------------- leia-me

const ROTULO_DA_MODALIDADE = {
  ead: "EAD (ensino a distância)",
  semipresencial: "Semipresencial",
  apoio: "Apoio ao treinamento presencial (não emite certificado)",
};
const ROTULO_DO_TIPO_DE_AULA = { video: "vídeo", pdf: "PDF", texto: "texto" };

/**
 * O LEIA-ME do pacote: quem gerou e quando, o resumo do curso, o conteúdo programático e as aulas, o que há
 * em cada arquivo (`arquivos`: [{ caminho, descricao }]), como ler os horários e a origem dos eventos, e os
 * `avisos` (o que não entrou ou ficou incompleto). Quebra de linha do Windows.
 */
export function textoLeiaMe({ empresa, curso, aulas, geradoEm, geradoPor, arquivos, avisos } = {}) {
  const c = curso ?? {};
  const linhas = [];
  const add = (...itens) => linhas.push(...itens);
  const campo = (rotulo, valor) => add(`${rotulo}: ${umaLinha(valor) || "—"}`);
  const comRegistro = (nome, registro) =>
    nome ? `${umaLinha(nome)}${registro ? ` (${umaLinha(registro)})` : ""}` : "";

  add("DOSSIÊ DE FISCALIZAÇÃO — TREINAMENTO EAD", "=".repeat(40), "");
  campo(
    "Empresa",
    [empresa?.razao_social || empresa?.nome, empresa?.cnpj && `CNPJ ${empresa.cnpj}`]
      .filter(Boolean)
      .join(", ")
  );
  campo("Gerado em", `${horaBR(geradoEm)} (horário de Brasília)`);
  campo("Gerado por", geradoPor);
  add(
    "Referência: NR-1, itens 1.6.5 e 1.7.4 e Anexo II (registros do treinamento a distância, à disposição da",
    "Inspeção do Trabalho).",
    ""
  );

  add("CURSO", "-----");
  campo("Nome", c.nome);
  campo("Código", c.codigo);
  campo("Modalidade", ROTULO_DA_MODALIDADE[modalidadeDoCurso(c)] ?? modalidadeDoCurso(c));
  campo("Situação no sistema", c.ativo === false ? "Rascunho (não publicado)" : "Publicado");
  campo("Carga horária", c.carga_horaria_horas ? `${c.carga_horaria_horas} h` : "");
  campo("Validade do treinamento", c.validade_meses ? `${c.validade_meses} meses` : "");
  campo(
    "Nota mínima na avaliação",
    numeroOuNull(c.nota_minima) !== null ? `${c.nota_minima}%` : ""
  );
  const maximo = numeroOuNull(c.max_tentativas);
  campo(
    "Tentativas na prova",
    maximo === null ? "" : maximo > 0 ? `até ${maximo} (mais as liberadas pelo RH)` : "sem limite"
  );
  campo(
    "Intervalo entre tentativas",
    numeroOuNull(c.intervalo_tentativa_min) !== null ? `${c.intervalo_tentativa_min} min` : ""
  );
  campo(
    "Responsável técnico",
    comRegistro(c.responsavel_tecnico_nome, c.responsavel_tecnico_registro)
  );
  campo("Instrutor", comRegistro(c.instrutor_nome, c.instrutor_qualificacao));
  add("");

  const programa = textoOuVazio(c.conteudo_programatico)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (programa.length) add("CONTEÚDO PROGRAMÁTICO", "---------------------", ...programa, "");

  const { vivas } = rotulosDasAulas(aulas);
  if (vivas.length) {
    add("AULAS", "-----");
    numerarAulas(vivas).forEach((a) => {
      const tipo = ROTULO_DO_TIPO_DE_AULA[a.tipo] ?? "";
      const tempo = Number(a.duracao_seg) > 0 ? formatarTempo(a.duracao_seg) : "";
      const detalhe = [tipo, tempo].filter(Boolean).join(", ");
      add(`${a.numero}. ${umaLinha(a.titulo) || "(sem título)"}${detalhe ? ` — ${detalhe}` : ""}`);
    });
    add("");
  }

  add("ARQUIVOS DESTE PACOTE", "---------------------");
  for (const a of lista(arquivos)) add(`- ${a.caminho}: ${umaLinha(a.descricao)}`);
  add("");

  add(
    "COMO LER",
    "--------",
    "- Os horários da trilha, das tentativas e dos certificados são do relógio do servidor, mostrados em",
    "  horário de Brasília e, nas planilhas, também em UTC.",
    '- Coluna "Origem" da trilha: "servidor" = o servidor viu e decidiu (login, aula concluída, prova,',
    '  certificado); "navegador" = o navegador do aluno informou (abriu a aula, play, pausa, saiu da tela) e o',
    "  servidor só carimbou a hora e o IP; vazio = a origem não consta nesse registro.",
    '- Coluna "Escopo" da trilha: "Matrícula do curso" são os eventos desta matrícula; "Acesso ao portal" são os',
    "  acessos de quem tem matrícula no curso (login, troca de senha...), que não pertencem a um curso só.",
    "- Matrícula removida pelo RH continua neste pacote: a remoção é lógica e a trilha segue guardada.",
    "- Cada certificado traz um código, um QR Code e um SHA-256. Qualquer pessoa confere o certificado na",
    "  página /ValidarCertificado do sistema (o CPF aparece mascarado).",
    ""
  );

  const itens = lista(avisos);
  add("AVISOS", "------");
  if (itens.length) for (const a of itens) add(`- ${umaLinha(a)}`);
  else add("Nenhum aviso: todos os arquivos foram gerados por inteiro.");

  return linhas.join(CRLF) + CRLF;
}

// -------------------------------------------------------------------------------------------- montagem

const AVISO_SEM_PROJETO =
  "O projeto pedagógico não está anexado ao curso, por isso não está neste pacote. Anexe o PDF no cadastro " +
  "do curso e exporte de novo.";
const AVISO_PROJETO_ANTIGO =
  "O projeto pedagógico do curso foi anexado em um sistema antigo e o arquivo não existe mais. Anexe o PDF de " +
  "novo no cadastro do curso e exporte de novo.";
const AVISO_PROJETO_FALHOU =
  "O projeto pedagógico não pôde ser baixado agora e não está neste pacote. Confira a conexão e exporte de novo.";

const ROTULO_DA_LEITURA = {
  trilha: "da trilha de auditoria",
  tentativas: "das tentativas da prova",
  progresso: "do progresso das aulas",
  matriculas: "das matrículas",
  funcionarios: "dos funcionários",
};

/** Sem conteúdo: nada, ou um Blob / ArrayBuffer / Uint8Array de zero byte. */
const arquivoVazio = (dados) => !dados || dados.size === 0 || dados.byteLength === 0;

/**
 * Junta tudo num ZIP e devolve `{ nomeArquivo, conteudo, resumo }`. Quem lê o banco e baixa o arquivo é a
 * tela; aqui entram os dados e as pontas de entrada e saída por `deps`:
 *   - `criarZip()`: fábrica do ZIP (JSZip);
 *   - `lerProjeto(ref)`: os bytes do projeto pedagógico (lança se não conseguir);
 *   - `gerarCertificado(certificado)`: os bytes do PDF de um certificado (lança se não conseguir) ou
 *     `{ arquivo, aviso }` quando o PDF saiu com uma ressalva (ex.: sem a imagem de uma assinatura): o
 *     certificado entra no pacote e a ressalva vira aviso;
 *   - `aoProgredir({ etapa, feitos?, total? })`: "arquivos", "certificados" (um por certificado) e
 *     "compactando"; um erro dele não derruba a montagem;
 *   - `tipoDeSaida`: "blob" (padrão, no navegador) ou "uint8array" (testes).
 * Os certificados são gerados um de cada vez (o QR do PDF é desenhado numa área da página). Projeto que não
 * baixa e certificado que não gera NÃO impedem o dossiê: viram aviso no LEIA-ME e no `resumo.avisos`.
 * `entrada.leituraIncompleta` lista o que a leitura do banco cortou ("trilha", "tentativas"...).
 *
 * @returns {Promise<{ nomeArquivo: string, conteudo: any, resumo: {
 *   matriculas: number, removidas: number, eventos: number, tentativas: number,
 *   certificados: { total: number, incluidos: number, falharam: Array<{codigo: string, motivo: string}>, omitidos: boolean },
 *   projeto: "incluido"|"sem_projeto"|"falhou", avisos: string[] } }>}
 */
export async function montarDossie(entrada, deps = {}) {
  const { criarZip, lerProjeto, gerarCertificado, aoProgredir, tipoDeSaida = "blob" } = deps;
  if (typeof criarZip !== "function") throw new Error("montarDossie: falta a fábrica do ZIP");
  const e = entrada ?? {};
  const curso = e.curso ?? {};
  const progredir = (passo) => {
    try {
      aoProgredir?.(passo);
    } catch {
      // a tela que mostrava o andamento pode ter fechado: a montagem continua
    }
  };

  const matriculas = lista(e.matriculas);
  const idsDasMatriculas = new Set(matriculas.map((m) => m.id));
  const eventos = eventosDoCurso({ eventos: e.eventos, matriculas });
  const tentativas = lista(e.tentativas).filter((t) => idsDasMatriculas.has(t.matricula_id));
  const geradoEm = e.geradoEm ?? new Date().toISOString();
  const nomeArquivo = nomeDoZip(curso, geradoEm);
  const raiz = nomeArquivo.replace(/\.zip$/, "");
  const zip = criarZip();
  const pasta = zip.folder(raiz);
  const avisos = [];
  const arquivos = [];

  progredir({ etapa: "arquivos" });

  // projeto pedagógico (Anexo II, 4.1)
  let projeto = "sem_projeto";
  const ref = textoOuVazio(curso.projeto_pedagogico_ref).trim();
  if (!ref) {
    avisos.push(AVISO_SEM_PROJETO);
  } else if (ehBase44(ref)) {
    avisos.push(AVISO_PROJETO_ANTIGO);
  } else {
    try {
      const bytes = await lerProjeto(ref);
      if (arquivoVazio(bytes)) throw new Error("arquivo vazio");
      const caminho = `projeto-pedagogico.${extensaoDoArquivo(ref) || "pdf"}`;
      pasta.file(caminho, bytes);
      arquivos.push({ caminho, descricao: "projeto pedagógico do curso, como está anexado." });
      projeto = "incluido";
    } catch (erro) {
      projeto = "falhou";
      avisos.push(AVISO_PROJETO_FALHOU);
      // o aviso do LEIA-ME é um só para qualquer causa: a causa (404, tempo esgotado, arquivo vazio) fica no
      // console de quem exportou. Sem a referência do arquivo no log: o caminho tem o id da empresa.
      console.error(
        "[dossie] projeto pedagógico não incluído:",
        erro instanceof Error ? erro.message : String(erro)
      );
    }
  }

  // planilhas
  const removidas = matriculas.filter((m) => m.deleted_at).length;
  const certificadosDoCurso = certificadosDoDossie({
    curso,
    certificados: e.certificados,
    funcionarios: e.funcionarios,
  });
  pasta.file(
    "matriculas.csv",
    BOM +
      csvDasMatriculas({
        matriculas,
        curso,
        funcionarios: e.funcionarios,
        aulas: e.aulas,
        progresso: e.progresso,
        tentativas,
        certificados: certificadosDoCurso.certificados,
      })
  );
  arquivos.push({
    caminho: "matriculas.csv",
    descricao: `${plural(matriculas.length, "matrícula", "matrículas")}, ${plural(removidas, "removida", "removidas")} (planilha: nota, tentativas, conclusão, certificado).`,
  });
  pasta.file(
    "trilha.csv",
    BOM + csvDaTrilha({ eventos, matriculas, funcionarios: e.funcionarios, aulas: e.aulas })
  );
  arquivos.push({
    caminho: "trilha.csv",
    descricao: `${plural(eventos.length, "evento", "eventos")} de todas as matrículas (acessos, aulas, prova, certificado), com hora do servidor, IP e aparelho.`,
  });
  pasta.file(
    "tentativas.csv",
    BOM + csvDasTentativas({ tentativas, matriculas, funcionarios: e.funcionarios })
  );
  arquivos.push({
    caminho: "tentativas.csv",
    descricao: `${plural(tentativas.length, "tentativa", "tentativas")} da prova, com cada questão, a alternativa marcada e a correta.`,
  });

  // certificados (um por vez)
  const { certificados, omitidos } = certificadosDoCurso;
  const falharam = [];
  const ressalvas = [];
  const nomesUsados = new Set();
  let incluidos = 0;
  for (let i = 0; i < certificados.length; i += 1) {
    const cert = certificados[i];
    try {
      const saida = await gerarCertificado(cert);
      const comRessalva = !!saida && typeof saida === "object" && "arquivo" in saida;
      const pdf = comRessalva ? saida.arquivo : saida;
      if (arquivoVazio(pdf)) throw new Error("PDF vazio");
      pasta.file(`certificados/${nomeDoCertificadoNoZip(cert, nomesUsados)}`, pdf);
      incluidos += 1;
      if (comRessalva && saida.aviso) {
        ressalvas.push(`${textoOuVazio(cert.codigo) || "(sem código)"} (${umaLinha(saida.aviso)})`);
      }
    } catch (erro) {
      falharam.push({
        codigo: textoOuVazio(cert.codigo) || "(sem código)",
        motivo: erro?.message || String(erro),
      });
    }
    progredir({ etapa: "certificados", feitos: i + 1, total: certificados.length });
  }
  if (omitidos) {
    arquivos.push({
      caminho: "certificados/",
      descricao:
        "pasta não criada: curso de apoio ao treinamento presencial não emite certificado.",
    });
  } else if (!certificados.length) {
    arquivos.push({
      caminho: "certificados/",
      descricao: "pasta não criada: nenhum certificado foi emitido neste curso.",
    });
  } else {
    arquivos.push({
      caminho: "certificados/",
      descricao: `${plural(incluidos, "certificado", "certificados")} em PDF (frente e verso); os revogados levam REVOGADO no nome.`,
    });
  }
  for (const f of falharam) {
    avisos.push(
      `O certificado ${f.codigo} não pôde ser gerado e não está neste pacote (${umaLinha(f.motivo)}).`
    );
  }
  if (ressalvas.length) {
    avisos.push(`Certificados que saíram incompletos no pacote: ${ressalvas.join("; ")}.`);
  }
  for (const parte of lista(e.leituraIncompleta)) {
    avisos.push(
      `A leitura ${ROTULO_DA_LEITURA[parte] ?? `de ${parte}`} ficou incompleta: o limite de linhas foi atingido e ` +
        "o arquivo pode estar sem os registros mais recentes. Não entregue este pacote como completo."
    );
  }

  pasta.file(
    "LEIA-ME.txt",
    BOM +
      textoLeiaMe({
        empresa: e.empresa,
        curso,
        aulas: e.aulas,
        geradoEm,
        geradoPor: e.geradoPor,
        arquivos,
        avisos,
      })
  );

  progredir({ etapa: "compactando" });
  const conteudo = await zip.generateAsync({ type: tipoDeSaida, compression: "DEFLATE" });
  return {
    nomeArquivo,
    conteudo,
    resumo: {
      matriculas: matriculas.length,
      removidas,
      eventos: eventos.length,
      tentativas: tentativas.length,
      certificados: { total: certificados.length, incluidos, falharam, omitidos },
      projeto,
      avisos,
    },
  };
}

/**
 * O texto do botão enquanto o dossiê é montado, a partir do passo que `montarDossie` (e a leitura do banco,
 * "lendo") informa: "Lendo os dados...", "Montando os arquivos...", "Certificados 3/12...", "Compactando...".
 */
export function textoDoAndamento(passo) {
  switch (passo?.etapa) {
    case "lendo":
      return "Lendo os dados...";
    case "arquivos":
      return "Montando os arquivos...";
    case "certificados":
      return passo.total
        ? `Certificados ${passo.feitos ?? 0}/${passo.total}...`
        : "Certificados...";
    case "compactando":
      return "Compactando...";
    default:
      return "Exportando...";
  }
}

/**
 * O toast depois de exportar: `{ tipo: "success" | "warning", texto }`. Com aviso (projeto que não veio,
 * certificado que não gerou, leitura cortada) o tipo é "warning" e o texto diz o que faltou.
 */
export function avisoDoDossie(resumo) {
  const r = resumo ?? {};
  const partes = [
    plural(r.matriculas ?? 0, "matrícula", "matrículas"),
    plural(r.eventos ?? 0, "evento da trilha", "eventos da trilha"),
    plural(r.tentativas ?? 0, "tentativa", "tentativas"),
    plural(r.certificados?.incluidos ?? 0, "certificado", "certificados"),
  ];
  const base = `Dossiê exportado: ${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}.`;
  const avisos = lista(r.avisos);
  if (!avisos.length) return { tipo: "success", texto: base };
  return {
    tipo: "warning",
    texto: `${base} Atenção: ${avisos.join(" ")} O LEIA-ME do pacote repete estes avisos.`,
  };
}
