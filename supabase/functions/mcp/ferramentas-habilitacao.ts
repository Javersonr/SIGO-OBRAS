/**
 * Ferramentas do conector do Claude: habilitação da licitação montada pelo SERVIDOR (spec
 * 2026-10-09 §4). O Claude manda só ids; o SIGO copia os documentos válidos da biblioteca
 * (acervo_documento) e os PDFs de CAT/atestado (acervo_atestado.arquivo_ref) para a pasta
 * "Envelope 02 – Habilitação" da oportunidade, sem ninguém enviar arquivo.
 *
 * Tudo pela CamadaEmpresa (empresa da chave). Origem e destino das cópias ficam na pasta da
 * empresa; nenhuma ref vem da entrada. A saída traz nome, tipo, validade e situação, nunca o conteúdo.
 *
 * Certidão errada numa licitação é o pior erro possível, então a ferramenta não se cala: documento
 * vencido, versão substituída, cópia antiga que ficou na pasta, sessão sem data e item que falhou
 * saem na resposta (nunca como se estivesse tudo certo). Ela só copia: apagar é do usuário.
 *
 * `anexar_edital_por_url` é a única que sai para a internet: o SERVIDOR baixa o edital de um link
 * público (travas de SSRF em _shared/conector/url-segura.ts) e grava na oportunidade. Nenhuma saída
 * nem log traz a URL pedida (pode ter token na query): só o host e o motivo.
 */
import type { PromptDef } from "../_shared/mcp/protocolo.ts";
import { dadosOuErro } from "../_shared/conector/camada-empresa.ts";
import {
  baixarObjeto,
  BUCKET_ACERVO,
  BUCKET_HABILITACAO,
  BUCKET_OPORTUNIDADE,
  caminhoDaEmpresa,
  ErroArquivo,
  extensaoDoNome,
  gravarNaOportunidade,
  nomeParaExibir,
  PASTA_HABILITACAO,
  registrarNoHistorico,
  TIPOS_DOCUMENTO_BIBLIOTECA,
  TIPOS_EDITAL,
  tipoPelosBytesServidor,
} from "../_shared/conector/arquivo-servidor.ts";
import { uuidOuNull } from "../_shared/conector/entrada.ts";
import { CATEGORIAS_EDITAL, pastaParaGravarServidor } from "../_shared/conector/envio-regras.ts";
import { linkOportunidade } from "../_shared/conector/recurso.ts";
import {
  baixarUrlPublica,
  ErroDownload,
  origemDaUrl,
  validarUrlPublica,
} from "../_shared/conector/url-segura.ts";
import { hojeBR } from "../_shared/edital/acervo.ts";
import { dataDaSessao } from "../_shared/habilitacao/data-sessao.ts";
import {
  diasAte,
  IDS_TIPO_DOCUMENTO,
  rotuloDoTipo,
  situacaoDaValidade,
  TIPOS_ESSENCIAIS,
  tipoDocumento,
  type DocumentoBiblioteca,
} from "../_shared/habilitacao/documentos-regras.ts";
import { falha, naoEncontrado, sucesso, type DepsFerramenta, type Ferramenta } from "./registro.ts";

export const MAX_DOCUMENTOS_POR_CHAMADA = 60;
export const MAX_ATESTADOS_POR_CHAMADA = 40;
const MAX_TIPOS = 20;

const ID_OPORTUNIDADE = { type: "string", description: "UUID da oportunidade" };
const GRAVACAO = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const nomeDoUsuario = (deps: DepsFerramenta) => `${deps.ctx.usuario.nome} (via Claude)`;
const fmtDataBR = (iso: string) => iso.split("-").reverse().join("/");

/** Tem ao menos um caractere que se vê (nem espaço, nem controle, nem caractere de formato invisível). */
const temTextoVisivel = (v: unknown): v is string =>
  typeof v === "string" && /[^\s\p{Cc}\p{Cf}]/u.test(v);

/** edital_analise vem como objeto (ou jsonb-string, do legado). */
function analiseDe(v: unknown): Record<string, unknown> | null {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return null;
    }
  }
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/** Por que um item não foi copiado (o `motivo` de cada entrada de `falhas`). */
type MotivoDaFalha =
  | ErroArquivo["codigo"]
  | "arquivo_fora_da_empresa"
  | "mantido_assinado"
  | "erro_interno";

/** Texto curto, em português, de cada motivo: vai em `falhas[].mensagem` para o Claude explicar ao usuário. */
export const MENSAGEM_DA_FALHA: Record<MotivoDaFalha, string> = {
  arquivo_fora_da_empresa: "O arquivo deste documento não está na pasta da empresa.",
  nao_encontrado: "O arquivo deste documento não foi encontrado no armazenamento.",
  tipo_nao_aceito: "O arquivo não é PDF, JPG ou PNG.",
  grande_demais: "O arquivo passa do limite de 50 MB.",
  vazio: "O arquivo está vazio.",
  storage: "O armazenamento não respondeu ao ler ou gravar o arquivo. Tente de novo.",
  mantido_assinado:
    "Já existe uma versão assinada deste documento na oportunidade; ela foi mantida, sem troca.",
  erro_interno: "Erro inesperado ao copiar este documento. Tente de novo.",
};

const falhaDoItem = (identificacao: Record<string, unknown>, motivo: MotivoDaFalha) => ({
  ...identificacao,
  motivo,
  mensagem: MENSAGEM_DA_FALHA[motivo],
});

/** A mensagem do erro sem nada que pareça URL, ref ou caminho do Storage (o erro de rede do Deno traz a URL do arquivo). */
const mensagemSemCaminho = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/\S*\/\S*/g, "[caminho]").slice(0, 300);

/** Log de um erro inesperado: nome do erro e mensagem sem caminho. Nunca a ref do arquivo. */
function logarErro(ferramenta: string, onde: string, e: unknown): void {
  const nome = e instanceof Error ? e.name : typeof e;
  console.error(`[conector] ${ferramenta}: ${onde}: ${nome}: ${mensagemSemCaminho(e)}`);
}

type CopiaFeita =
  | { situacao: "copiado"; arquivoId: string; nome: string; substituiu: boolean }
  | { situacao: "mantido_assinado" }
  | { situacao: "falha"; motivo: MotivoDaFalha }
  | { situacao: "sem_oportunidade" };

/**
 * Copia um arquivo do Storage da empresa (biblioteca ou acervo) para a pasta do envelope da oportunidade.
 * A ref vem do banco, nunca da entrada do Claude: mesmo assim confere bucket e pasta da empresa antes de
 * baixar. Qualquer falha DO ITEM (fora da empresa, sumiu, vazio, grande demais, tipo, e também erro de banco,
 * da RPC, resposta estranha ou rede que cai) vira `falha` e quem chama segue com o próximo: os já copiados
 * não ficam sem histórico. Só a oportunidade que sumiu interrompe (`sem_oportunidade`). Repetir é seguro: a
 * `origem` troca o arquivo no lugar.
 */
async function copiarParaEnvelope(
  deps: DepsFerramenta,
  p: {
    ferramenta: string;
    /** Id do documento ou do atestado (só para o log). */
    itemId: string;
    oportunidadeId: string;
    bucket: string;
    ref: unknown;
    origem: string;
    /** O nome (sem sanear) a partir da extensão do tipo que os bytes provaram. */
    nomeCom: (extensao: string) => string;
  }
): Promise<CopiaFeita> {
  try {
    const caminho = caminhoDaEmpresa(p.ref, p.bucket, deps.db.empresaId);
    if (!caminho) return { situacao: "falha", motivo: "arquivo_fora_da_empresa" };
    const bytes = await baixarObjeto(deps.storage, p.bucket, caminho);
    const tipo = tipoPelosBytesServidor(bytes.subarray(0, 8), caminho, TIPOS_DOCUMENTO_BIBLIOTECA);
    if (!tipo) return { situacao: "falha", motivo: "tipo_nao_aceito" };
    const nome = nomeParaExibir(p.nomeCom(tipo));
    const g = await gravarNaOportunidade(
      { db: deps.db, storage: deps.storage, agora: deps.agora },
      {
        oportunidadeId: p.oportunidadeId,
        origem: p.origem,
        nome,
        bytes,
        tipo,
        pasta: PASTA_HABILITACAO,
        categoria: null,
        assinatura: null,
        usuarioNome: nomeDoUsuario(deps),
      }
    );
    if (!g) return { situacao: "sem_oportunidade" };
    // não é para acontecer (cópia nunca é gravada com assinatura), mas se a versão assinada ficou, a
    // saída não afirma que anexou
    if (g.mantido_assinado) return { situacao: "mantido_assinado" };
    return { situacao: "copiado", arquivoId: g.arquivo_id, nome, substituiu: g.substituiu };
  } catch (e) {
    if (e instanceof ErroArquivo) return { situacao: "falha", motivo: e.codigo };
    logarErro(p.ferramenta, `erro inesperado no item ${p.itemId}`, e);
    return { situacao: "falha", motivo: "erro_interno" };
  }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ─── anexar_habilitacao ─────────────────────────────────────────────────────────────────────

/** `tipos` opcional: lista de 1 a 20 ids da tabela de tipos, sem repetir (mantém a ordem do pedido). */
function lerTipos(
  v: unknown
): { ok: true; tipos: string[] | null } | { ok: false; erros: string[] } {
  if (v === undefined || v === null) return { ok: true, tipos: null };
  if (!Array.isArray(v))
    return { ok: false, erros: ["tipos deve ser uma lista de tipos de documento."] };
  if (v.length === 0) {
    return { ok: false, erros: ["tipos está vazio: informe ao menos um tipo ou omita o campo."] };
  }
  if (v.length > MAX_TIPOS) {
    return { ok: false, erros: [`tipos aceita no máximo ${MAX_TIPOS} itens.`] };
  }
  const erros: string[] = [];
  v.forEach((t, i) => {
    if (typeof t !== "string" || !IDS_TIPO_DOCUMENTO.includes(t)) {
      erros.push(`tipos[${i}]: "${String(t).slice(0, 40)}" não é um tipo de documento válido.`);
    }
  });
  return erros.length ? { ok: false, erros } : { ok: true, tipos: [...new Set(v as string[])] };
}

const posicaoDoTipo = (tipo: string) => {
  const i = IDS_TIPO_DOCUMENTO.indexOf(tipo);
  return i < 0 ? IDS_TIPO_DOCUMENTO.length : i;
};

/** "<rótulo> - <nome>"; em "outro" só o nome; nome sem caractere visível: só o rótulo do tipo. */
function nomeBaseDoDocumento(d: DocumentoBiblioteca): string {
  const rotulo = rotuloDoTipo(d.tipo);
  if (!temTextoVisivel(d.nome)) return rotulo;
  return tipoDocumento(d.tipo)?.id === "outro" ? d.nome : `${rotulo} - ${d.nome}`;
}

const AVISO_SEM_SESSAO =
  "A oportunidade não tem data de sessão futura: não conferi se algum documento vence antes dela.";
const AVISO_COPIAS_NAO_CONFERIDAS =
  "Não consegui conferir se há arquivos antigos da biblioteca na pasta do envelope: confira à mão.";

const PREFIXO_BIBLIOTECA = "biblioteca:";
/** Ids por consulta `in`: 100 UUIDs cabem folgados no limite da URL do PostgREST. */
const LOTE_DE_IDS = 100;

interface CopiaDesatualizada {
  arquivo_id: string;
  nome: string;
  motivo: "substituido" | "removido" | "vencido";
}

/**
 * Os arquivos da biblioteca que JÁ estavam na oportunidade (origem `biblioteca:<documento_id>`) e hoje
 * não valem: o documento foi substituído (ativo = false, por exemplo ao renovar a certidão pela tela), foi
 * removido da biblioteca ou venceu. A cópia da versão antiga não é trocada pela nova (origens diferentes) e
 * ficaria na pasta do envelope ao lado da nova: quem monta o envelope tem de saber. Não apaga nada.
 *
 * `ativos` = os documentos ativos da biblioteca que a chamada já leu; só os que não estão entre eles
 * (substituídos ou removidos) são lidos por id, numa consulta (em lotes de 100). Documento válido que o usuário
 * não pediu agora fica de fora: só entra quem não vale mais.
 */
async function copiasDesatualizadas(
  deps: DepsFerramenta,
  oportunidadeId: string,
  hoje: string,
  ativos: ReadonlyMap<string, DocumentoBiblioteca>
): Promise<CopiaDesatualizada[]> {
  const linhas = await deps.db.lerTodos<{ id: string; nome: string | null; origem: string | null }>(
    "arquivo_oportunidade",
    "id, nome, origem",
    (q) => q.eq("oportunidade_id", oportunidadeId).like("origem", `${PREFIXO_BIBLIOTECA}%`)
  );
  // o filtro like já fez isto no banco; conferir aqui garante que acervo:, gerado:, declaracao:, url: e
  // linha sem origem nunca entrem, mesmo que o filtro um dia deixe de valer
  const copias = linhas
    .filter((l) => typeof l.origem === "string" && l.origem.startsWith(PREFIXO_BIBLIOTECA))
    .map((l) => ({
      arquivoId: l.id,
      nome: String(l.nome ?? ""),
      documentoId: String(l.origem).slice(PREFIXO_BIBLIOTECA.length),
    }));
  const vencido = (validade: unknown) => situacaoDaValidade(validade, hoje).situacao === "vencido";

  const achados: CopiaDesatualizada[] = [];
  const registrar = (c: (typeof copias)[number], motivo: CopiaDesatualizada["motivo"]) =>
    achados.push({ arquivo_id: c.arquivoId, nome: c.nome, motivo });

  const foraDosAtivos: typeof copias = [];
  for (const c of copias) {
    const d = ativos.get(c.documentoId);
    if (!d) foraDosAtivos.push(c);
    else if (vencido(d.validade)) registrar(c, "vencido");
  }

  // id que não é UUID não existe na biblioteca (e faria o banco recusar a consulta inteira): fica de fora do `in`
  const ids = [
    ...new Set(foraDosAtivos.map((c) => uuidOuNull(c.documentoId)).filter((x): x is string => !!x)),
  ];
  const lidos = new Map<string, { ativo?: boolean | null; validade?: string | null }>();
  for (let i = 0; i < ids.length; i += LOTE_DE_IDS) {
    const lote = ids.slice(i, i + LOTE_DE_IDS);
    const rows =
      dadosOuErro<{ id: string; ativo?: boolean | null; validade?: string | null }[]>(
        await deps.db.ler("acervo_documento", "id, ativo, validade").in("id", lote)
      ) ?? [];
    for (const r of rows) lidos.set(String(r.id).toLowerCase(), r);
  }
  for (const c of foraDosAtivos) {
    const r = lidos.get(uuidOuNull(c.documentoId) ?? "");
    if (!r) registrar(c, "removido");
    else if (r.ativo === false) registrar(c, "substituido");
    else if (vencido(r.validade)) registrar(c, "vencido");
  }
  return achados.sort(
    (a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) ||
      a.arquivo_id.localeCompare(b.arquivo_id)
  );
}

const ANEXAR_HABILITACAO: Ferramenta = {
  def: {
    name: "anexar_habilitacao",
    title: "Anexar a habilitação da empresa à oportunidade",
    description:
      'Copia para a pasta "Envelope 02 – Habilitação" da oportunidade os documentos VÁLIDOS da biblioteca de habilitação da empresa (certidões, contrato social, balanço…), sem ninguém enviar arquivo. Sem tipos, anexa todos os documentos em vigor. Documento vencido não é anexado: volta em vencidos; o que a empresa não tem volta em faltam. Repetir a chamada troca os arquivos no lugar, sem duplicar. Cópias antigas que já estavam na pasta e vêm de versão substituída, removida ou vencida voltam em copias_desatualizadas (o SIGO não apaga): avise o usuário para excluí-las. Leia sempre avisos e falhas e repasse ao usuário.',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        oportunidade_id: ID_OPORTUNIDADE,
        tipos: {
          type: "array",
          minItems: 1,
          maxItems: MAX_TIPOS,
          description: "só estes tipos de documento (omita para anexar todos os em vigor)",
          items: { type: "string", enum: [...IDS_TIPO_DOCUMENTO] },
        },
      },
      required: ["oportunidade_id"],
    },
    annotations: GRAVACAO,
  },
  async executar(args, deps) {
    const id = uuidOuNull(args.oportunidade_id);
    const pedido = lerTipos(args.tipos);
    if (!pedido.ok) {
      return falha(
        "tipos inválidos.",
        "validacao",
        { erros: pedido.erros, tipos_validos: [...IDS_TIPO_DOCUMENTO] },
        id
      );
    }
    const tipos = pedido.tipos;
    // licitacao_data é a "Sessão" que a tela mostra e o usuário edita; o edital é o plano B
    const op = id
      ? await deps.db.porId<{ id: string; edital_analise: unknown; licitacao_data: unknown }>(
          "oportunidade",
          id,
          "id, edital_analise, licitacao_data"
        )
      : null;
    if (!id || !op) return naoEncontrado("oportunidade", id);

    // só documentos em vigor: a consulta já filtra ativo = true, e aqui se descarta de novo (como o
    // certidoesDaBiblioteca) uma versão substituída que escape, para nunca copiar a certidão errada
    const todos = (
      await deps.db.lerTodos<DocumentoBiblioteca>(
        "acervo_documento",
        "id, tipo, nome, arquivo_ref, numero, validade, ativo",
        (q) => q.eq("ativo", true)
      )
    ).filter((d) => d.ativo !== false);
    const docs = todos
      .filter((d) => !tipos || tipos.includes(d.tipo))
      .sort(
        (a, b) =>
          posicaoDoTipo(a.tipo) - posicaoDoTipo(b.tipo) ||
          String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR") ||
          String(a.id).localeCompare(String(b.id))
      );

    const hoje = hojeBR(deps.agora);
    const sessao = dataDaSessao(op, hoje).futura;
    const vencidos: DocumentoBiblioteca[] = [];
    const validos: DocumentoBiblioteca[] = [];
    for (const d of docs) {
      (situacaoDaValidade(d.validade, hoje).situacao === "vencido" ? vencidos : validos).push(d);
    }
    if (validos.length > MAX_DOCUMENTOS_POR_CHAMADA) {
      return falha(
        `São ${validos.length} documentos válidos; o limite é ${MAX_DOCUMENTOS_POR_CHAMADA} por chamada. Informe tipos.`,
        "muitos_documentos",
        { total: validos.length, limite: MAX_DOCUMENTOS_POR_CHAMADA },
        id
      );
    }

    const anexados: Record<string, unknown>[] = [];
    const falhas: Record<string, unknown>[] = [];
    let mantidosAssinados = 0;
    for (const d of validos) {
      const r = await copiarParaEnvelope(deps, {
        ferramenta: "anexar_habilitacao",
        itemId: d.id,
        oportunidadeId: id,
        bucket: BUCKET_HABILITACAO,
        ref: d.arquivo_ref,
        origem: `${PREFIXO_BIBLIOTECA}${d.id}`,
        nomeCom: (ext) => `${nomeBaseDoDocumento(d)}.${ext}`,
      });
      if (r.situacao === "sem_oportunidade") return naoEncontrado("oportunidade", id);
      if (r.situacao === "falha") {
        falhas.push(falhaDoItem({ documento_id: d.id, nome: d.nome }, r.motivo));
      } else if (r.situacao === "mantido_assinado") {
        mantidosAssinados++;
        falhas.push(falhaDoItem({ documento_id: d.id, nome: d.nome }, "mantido_assinado"));
      } else {
        anexados.push({
          documento_id: d.id,
          tipo: d.tipo,
          rotulo: rotuloDoTipo(d.tipo),
          nome: r.nome,
          validade: d.validade ?? null,
          arquivo_id: r.arquivoId,
          substituiu: r.substituiu,
          // estritamente antes: validade igual ao dia da sessão ainda vale nela
          vence_antes_da_sessao: !!sessao && (diasAte(d.validade, sessao) ?? 0) < 0,
        });
      }
    }

    // o que a empresa não tem nenhum em vigor (nem válido nem vencido: o vencido já aparece em `vencidos`)
    const comDocumento = new Set(docs.map((d) => d.tipo));
    const faltam = (tipos ?? TIPOS_ESSENCIAIS)
      .filter((t) => !comDocumento.has(t))
      .map((t) => ({ tipo: t, rotulo: rotuloDoTipo(t) }));

    // arquivos da biblioteca que já estavam na pasta e hoje não valem (versão substituída, removida ou vencida):
    // a cópia nova não os troca (outra origem). Falha ao conferir não derruba a ferramenta, mas também não
    // se cala: sem a lista e com aviso (uma lista vazia diria que está tudo certo)
    let copiasAntigas: CopiaDesatualizada[] | null = null;
    try {
      copiasAntigas = await copiasDesatualizadas(
        deps,
        id,
        hoje,
        new Map(todos.map((d) => [d.id, d]))
      );
    } catch (e) {
      logarErro("anexar_habilitacao", "conferir as cópias antigas da pasta", e);
    }

    const avisos: string[] = [];
    const antesDaSessao = anexados.filter((a) => a.vence_antes_da_sessao).length;
    if (sessao) {
      if (antesDaSessao) {
        avisos.push(
          `${plural(antesDaSessao, "documento vence", "documentos vencem")} antes da sessão (${fmtDataBR(sessao)}): renove e anexe de novo.`
        );
      }
    } else if (anexados.length > 0) {
      // sem data de sessão futura não há como saber se algo vence antes dela: nunca calar sobre isso
      avisos.push(AVISO_SEM_SESSAO);
    }
    if (vencidos.length) {
      avisos.push(
        `${vencidos.length === 1 ? "1 documento vencido não foi anexado" : `${vencidos.length} documentos vencidos não foram anexados`}: atualize em Acervo técnico → Documentos e certidões.`
      );
    }
    if (mantidosAssinados) {
      avisos.push(
        `${mantidosAssinados === 1 ? "1 documento já tem uma versão assinada na oportunidade e foi mantido" : `${mantidosAssinados} documentos já têm uma versão assinada na oportunidade e foram mantidos`}, sem troca.`
      );
    }
    // o já assinado tem aviso próprio acima; aqui entram os que de fato não puderam ser copiados
    const naoCopiados = falhas.length - mantidosAssinados;
    if (naoCopiados > 0) {
      avisos.push(
        `${naoCopiados === 1 ? "1 documento não pôde ser copiado" : `${naoCopiados} documentos não puderam ser copiados`}: veja falhas.`
      );
    }
    if (copiasAntigas === null) {
      avisos.push(AVISO_COPIAS_NAO_CONFERIDAS);
    } else if (copiasAntigas.length) {
      const n = copiasAntigas.length;
      avisos.push(
        `${n === 1 ? "1 arquivo da biblioteca nesta oportunidade vem" : `${n} arquivos da biblioteca nesta oportunidade vêm`} de versão substituída, removida ou vencida: exclua-${n === 1 ? "o" : "os"} da pasta do envelope.`
      );
    }

    if (anexados.length > 0) {
      await registrarNoHistorico(
        deps.db,
        id,
        nomeDoUsuario(deps),
        `Habilitação anexada pelo Claude: ${anexados.length} documento(s) da biblioteca`
      );
    }
    return sucesso(
      {
        oportunidade_id: id,
        pasta: PASTA_HABILITACAO,
        anexados,
        vencidos: vencidos.map((d) => ({
          documento_id: d.id,
          tipo: d.tipo,
          rotulo: rotuloDoTipo(d.tipo),
          nome: d.nome,
          validade: d.validade ?? null,
        })),
        faltam,
        falhas,
        // ausente (e não vazia) quando a conferência falhou: há um aviso dizendo isso
        ...(copiasAntigas ? { copias_desatualizadas: copiasAntigas } : {}),
        avisos,
        link: linkOportunidade(id),
      },
      { alvo: id }
    );
  },
};

// ─── anexar_acervo ──────────────────────────────────────────────────────────────────────────

const ROTULO_ACERVO: Record<string, string> = {
  cat: "CAT",
  atestado: "Atestado",
  cao: "CAO",
  cat_profissional: "CAT profissional",
};

interface AtestadoLido {
  id: string;
  tipo: string | null;
  numero: string | null;
  contratante: string | null;
  arquivo_ref: string | null;
}

/** `atestado_ids` opcional: lista de 1 a 40 UUIDs (sem repetir, na ordem do pedido). */
function lerAtestadoIds(
  v: unknown
): { ok: true; ids: string[] | null } | { ok: false; erros: string[] } {
  if (v === undefined || v === null) return { ok: true, ids: null };
  if (!Array.isArray(v)) return { ok: false, erros: ["atestado_ids deve ser uma lista de UUIDs."] };
  if (v.length === 0) {
    return {
      ok: false,
      erros: ["atestado_ids está vazio: informe ao menos um id ou omita o campo."],
    };
  }
  if (v.length > MAX_ATESTADOS_POR_CHAMADA) {
    return {
      ok: false,
      erros: [`atestado_ids aceita no máximo ${MAX_ATESTADOS_POR_CHAMADA} itens.`],
    };
  }
  const ids: string[] = [];
  const erros: string[] = [];
  v.forEach((x, i) => {
    const uuid = uuidOuNull(x);
    if (!uuid) erros.push(`atestado_ids[${i}] não é um UUID válido.`);
    else if (!ids.includes(uuid)) ids.push(uuid);
  });
  return erros.length ? { ok: false, erros } : { ok: true, ids };
}

/** O primeiro texto visível entre número, contratante e o começo do id. */
function identificacaoDoAtestado(a: AtestadoLido): string {
  const texto = [a.numero, a.contratante].find(temTextoVisivel);
  return texto ? texto : String(a.id).slice(0, 8);
}

const ANEXAR_ACERVO: Ferramenta = {
  def: {
    name: "anexar_acervo",
    title: "Anexar CATs e atestados do acervo à oportunidade",
    description:
      'Copia para a pasta "Envelope 02 – Habilitação" os PDFs das CATs e atestados do acervo técnico. Sem atestado_ids, usa as CATs indicadas no Atende? (cats_anexar). Atestado sem PDF no acervo volta em sem_pdf. Repetir a chamada não duplica.',
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        oportunidade_id: ID_OPORTUNIDADE,
        atestado_ids: {
          type: "array",
          minItems: 1,
          maxItems: MAX_ATESTADOS_POR_CHAMADA,
          description: "ids (UUID) do ler_acervo; omita para usar as CATs do Atende?",
          items: { type: "string" },
        },
      },
      required: ["oportunidade_id"],
    },
    annotations: GRAVACAO,
  },
  async executar(args, deps) {
    const id = uuidOuNull(args.oportunidade_id);
    const pedido = lerAtestadoIds(args.atestado_ids);
    if (!pedido.ok) {
      return falha(
        "atestado_ids inválidos.",
        "validacao",
        { erros: pedido.erros, limite: MAX_ATESTADOS_POR_CHAMADA },
        id
      );
    }
    const op = id
      ? await deps.db.porId<{ id: string; edital_analise: unknown }>(
          "oportunidade",
          id,
          "id, edital_analise"
        )
      : null;
    if (!id || !op) return naoEncontrado("oportunidade", id);

    let ids = pedido.ids;
    if (!ids) {
      // padrão: as CATs que o Atende? mandou anexar (ids que são UUID, sem repetir)
      // deno-lint-ignore no-explicit-any
      const cats = (analiseDe(op.edital_analise) as any)?.atende?.cats_anexar;
      ids = [];
      for (const c of Array.isArray(cats) ? cats : []) {
        const uuid = uuidOuNull(c?.id);
        if (uuid && !ids.includes(uuid)) ids.push(uuid);
      }
      if (ids.length === 0) {
        return falha(
          "Nenhuma CAT indicada: grave o Atende? com registrar_atende (cats_anexar) ou informe atestado_ids.",
          "sem_cats",
          {},
          id
        );
      }
      if (ids.length > MAX_ATESTADOS_POR_CHAMADA) {
        return falha(
          `O Atende? indica ${ids.length} atestados; o limite é ${MAX_ATESTADOS_POR_CHAMADA} por chamada. Informe atestado_ids em lotes.`,
          "validacao",
          { erros: [`${ids.length} atestados no cats_anexar.`], limite: MAX_ATESTADOS_POR_CHAMADA },
          id
        );
      }
    }

    const anexados: Record<string, unknown>[] = [];
    const semPdf: Record<string, unknown>[] = [];
    const naoEncontrados: string[] = [];
    const falhas: Record<string, unknown>[] = [];
    for (const idAtestado of ids) {
      let a: AtestadoLido | null;
      try {
        a = await deps.db.porId<AtestadoLido>(
          "acervo_atestado",
          idAtestado,
          "id, tipo, numero, contratante, arquivo_ref"
        );
      } catch (e) {
        // erro de banco ao ler UM atestado: ele vira falha e os outros seguem
        logarErro("anexar_acervo", `erro inesperado no item ${idAtestado}`, e);
        falhas.push(falhaDoItem({ atestado_id: idAtestado }, "erro_interno"));
        continue;
      }
      if (!a) {
        naoEncontrados.push(idAtestado);
        continue;
      }
      if (typeof a.arquivo_ref !== "string" || !a.arquivo_ref.trim()) {
        semPdf.push({ atestado_id: a.id, numero: a.numero ?? null });
        continue;
      }
      const r = await copiarParaEnvelope(deps, {
        ferramenta: "anexar_acervo",
        itemId: a.id,
        oportunidadeId: id,
        bucket: BUCKET_ACERVO,
        ref: a.arquivo_ref,
        origem: `acervo:${a.id}`,
        nomeCom: (ext) =>
          `${ROTULO_ACERVO[String(a.tipo)] ?? "Atestado"} ${identificacaoDoAtestado(a)}.${ext}`,
      });
      if (r.situacao === "sem_oportunidade") return naoEncontrado("oportunidade", id);
      if (r.situacao === "falha") {
        falhas.push(falhaDoItem({ atestado_id: a.id }, r.motivo));
      } else if (r.situacao === "mantido_assinado") {
        falhas.push(falhaDoItem({ atestado_id: a.id }, "mantido_assinado"));
      } else {
        anexados.push({
          atestado_id: a.id,
          numero: a.numero ?? null,
          nome: r.nome,
          arquivo_id: r.arquivoId,
          substituiu: r.substituiu,
        });
      }
    }

    if (anexados.length > 0) {
      await registrarNoHistorico(
        deps.db,
        id,
        nomeDoUsuario(deps),
        `Acervo técnico anexado pelo Claude: ${anexados.length} documento(s)`
      );
    }
    return sucesso(
      {
        oportunidade_id: id,
        pasta: PASTA_HABILITACAO,
        anexados,
        sem_pdf: semPdf,
        nao_encontrados: naoEncontrados,
        falhas,
        link: linkOportunidade(id),
      },
      { alvo: id }
    );
  },
};

// ─── anexar_edital_por_url ──────────────────────────────────────────────────────────────────

const EXTENSOES_EDITAL = ["pdf", "zip", "doc", "docx", "xls", "xlsx"];
const MENSAGEM_NOME_EDITAL =
  "nome: informe o nome com a extensão .pdf, .zip, .doc, .docx, .xls ou .xlsx.";
const PROXIMO_PASSO_PDF =
  'Para o Claude ler este PDF depois pelo SIGO, o usuário clica em "Preparar para o Claude" na aba Arquivos.';
const AVISO_JA_ANEXADO = "O edital deste link já estava anexado e não mudou.";
const AVISO_TROCADO_PDF =
  'O edital mudou e foi trocado no lugar: clique de novo em "Preparar para o Claude" nesse arquivo antes de ler.';
const AVISO_TROCADO = "O edital mudou e foi trocado no lugar.";
const AVISO_ASSINADO_MANTIDO =
  "Já existe uma versão assinada deste edital na oportunidade; ela foi mantida, sem troca.";
const AVISO_SEM_LIGACAO =
  "O arquivo foi anexado, mas não consegui ligá-lo à análise do edital desta oportunidade.";

function bytesIguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** "edital.<ext>" quando o nome pedido não tem letra nem número antes da extensão (".pdf", "---.pdf"). */
function nomeDoEdital(pedido: unknown, limpo: string, extensao: string): string {
  const base = String(pedido ?? "").replace(/\.[A-Za-z0-9]{1,8}\s*$/, "");
  return /[\p{L}\p{N}]/u.test(base) ? limpo : `edital.${extensao}`;
}

interface ArquivoDoLink {
  id: string;
  nome: string;
  categoria: string | null;
}

/**
 * O arquivo desta oportunidade que veio DESTE link (mesma `origem`) e é idêntico ao que acabou de ser baixado.
 * Trocar no lugar apaga o texto preparado ("Preparar para o Claude"), então o arquivo idêntico não é trocado.
 * Só confere o conteúdo quando o tamanho bate. Qualquer falha na conferência (banco, ref que não é da pasta da
 * empresa, Storage) vai ao log, sem ref, e devolve null: aí a ferramenta segue e grava normalmente.
 */
async function arquivoIdenticoDoLink(
  deps: DepsFerramenta,
  oportunidadeId: string,
  origem: string,
  bytes: Uint8Array
): Promise<ArquivoDoLink | null> {
  try {
    const linhas =
      dadosOuErro<
        {
          id: string;
          nome: string | null;
          url: string | null;
          tamanho: unknown;
          categoria: string | null;
        }[]
      >(
        await deps.db
          .ler("arquivo_oportunidade", "id, nome, url, tamanho, categoria")
          .eq("oportunidade_id", oportunidadeId)
          .eq("origem", origem)
          .limit(1)
      ) ?? [];
    const linha = linhas[0];
    if (!linha || Number(linha.tamanho) !== bytes.length) return null;
    const caminho = caminhoDaEmpresa(linha.url, BUCKET_OPORTUNIDADE, deps.db.empresaId);
    if (!caminho) return null;
    const atual = await baixarObjeto(deps.storage, BUCKET_OPORTUNIDADE, caminho);
    if (!bytesIguais(atual, bytes)) return null;
    return { id: linha.id, nome: String(linha.nome ?? ""), categoria: linha.categoria ?? null };
  } catch (e) {
    logarErro("anexar_edital_por_url", "conferir se o edital já estava anexado", e);
    return null;
  }
}

const ANEXAR_EDITAL_POR_URL: Ferramenta = {
  def: {
    name: "anexar_edital_por_url",
    title: "Baixar o edital pelo link e anexar à oportunidade",
    description:
      "Baixa pelo SERVIDOR do SIGO um arquivo do edital a partir do link público (portal de compras, site da prefeitura) e grava nos Arquivos da oportunidade, na pasta Edital. Use quando o edital tem link de download: ninguém precisa enviar o arquivo. Só https; até 50 MB; PDF, ZIP, Word ou Excel. O link tem de ser o do arquivo, não o da página. Repetir com o mesmo link troca o arquivo no lugar; se o arquivo não mudou, nada é trocado (ja_estava_anexado). Leia os avisos e repasse ao usuário: quando o edital muda, o texto preparado do PDF some e é preciso preparar de novo.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        oportunidade_id: ID_OPORTUNIDADE,
        url: { type: "string", maxLength: 2000, description: "link público https do arquivo" },
        nome: {
          type: "string",
          maxLength: 200,
          description: "nome do arquivo, com a extensão: .pdf, .zip, .doc, .docx, .xls ou .xlsx",
        },
        categoria: {
          type: "string",
          enum: [...CATEGORIAS_EDITAL],
          description: "o que é este arquivo no edital",
        },
      },
      required: ["oportunidade_id", "url", "nome", "categoria"],
    },
    annotations: { ...GRAVACAO, openWorldHint: true },
  },
  async executar(args, deps) {
    const id = uuidOuNull(args.oportunidade_id);
    const nomeLimpo = nomeParaExibir(typeof args.nome === "string" ? args.nome : "");
    const extensao = extensaoDoNome(nomeLimpo);
    if (!EXTENSOES_EDITAL.includes(extensao)) {
      return falha(MENSAGEM_NOME_EDITAL, "validacao", {}, id);
    }
    const categoria = args.categoria;
    if (
      typeof categoria !== "string" ||
      !(CATEGORIAS_EDITAL as readonly string[]).includes(categoria)
    ) {
      return falha(
        `categoria: use ${CATEGORIAS_EDITAL.join(", ")}.`,
        "validacao",
        { categorias_validas: [...CATEGORIAS_EDITAL] },
        id
      );
    }
    const op = id ? await deps.db.porId<{ id: string }>("oportunidade", id, "id") : null;
    if (!id || !op) return naoEncontrado("oportunidade", id);

    const v = validarUrlPublica(args.url);
    if (!v.ok) return falha(v.mensagem, "url_invalida", {}, id);
    if (!deps.resolverDns) {
      return falha(
        "O SIGO não consegue baixar por link agora. Tente de novo.",
        "indisponivel",
        {},
        id
      );
    }

    let baixado: Awaited<ReturnType<typeof baixarUrlPublica>>;
    try {
      baixado = await baixarUrlPublica(v.url.href, {
        fetchFn: deps.fetchFn,
        resolverDns: deps.resolverDns,
      });
    } catch (e) {
      if (!(e instanceof ErroDownload)) throw e;
      // só o host e o motivo: a URL pode trazer token na query
      console.error(
        `[conector] anexar_edital_por_url: download recusado (host ${v.url.hostname}, motivo ${e.codigo})`
      );
      return falha(e.message, e.codigo, {}, id);
    }

    // o tipo vem dos bytes e tem de ser o da extensão do nome (página de login ou de erro não é o edital)
    const tipo = tipoPelosBytesServidor(baixado.bytes.subarray(0, 8), nomeLimpo, TIPOS_EDITAL);
    if (tipo === null || tipo !== extensao) {
      return falha(
        `O arquivo baixado não é um .${extensao} de verdade (o link pode ser de uma página de login ou de erro, e não do arquivo).`,
        "tipo_nao_aceito",
        {},
        id
      );
    }
    const nome = nomeDoEdital(args.nome, nomeLimpo, tipo);
    const baixadoDe = new URL(baixado.urlFinal).hostname;
    const origem = await origemDaUrl(String(args.url));
    const link = linkOportunidade(id);

    // o mesmo link com o mesmo arquivo: não troca nada (a troca no lugar apaga o texto preparado do PDF)
    const igual = await arquivoIdenticoDoLink(deps, id, origem, baixado.bytes);
    if (igual) {
      const avisos = [AVISO_JA_ANEXADO];
      const nomeGravado = igual.nome || nome;
      if (nomeGravado !== nome || igual.categoria !== categoria) {
        avisos.push(
          `Nome e categoria não foram alterados: o arquivo já estava anexado como "${nomeGravado}" (categoria ${igual.categoria ?? "sem categoria"}).`
        );
      }
      return sucesso(
        {
          oportunidade_id: id,
          arquivo_id: igual.id,
          nome: nomeGravado,
          tipo,
          tamanho: baixado.bytes.length,
          categoria: igual.categoria,
          substituiu: false,
          ja_estava_anexado: true,
          baixado_de: baixadoDe,
          redirecionamentos: baixado.saltos,
          proximo_passo: tipo === "pdf" ? PROXIMO_PASSO_PDF : null,
          avisos,
          link,
        },
        { alvo: id }
      );
    }

    let g: Awaited<ReturnType<typeof gravarNaOportunidade>>;
    try {
      g = await gravarNaOportunidade(
        { db: deps.db, storage: deps.storage, agora: deps.agora },
        {
          oportunidadeId: id,
          origem,
          nome,
          bytes: baixado.bytes,
          tipo,
          pasta: pastaParaGravarServidor(null, categoria),
          categoria,
          assinatura: null,
          usuarioNome: nomeDoUsuario(deps),
        }
      );
    } catch (e) {
      if (e instanceof ErroArquivo) return falha(mensagemSemCaminho(e), e.codigo, {}, id);
      throw e;
    }
    if (!g) return naoEncontrado("oportunidade", id);
    if (g.mantido_assinado) {
      // já existe uma versão ASSINADA deste link: nada mudou (nem o texto preparado). Nada é dito do arquivo
      // gravado (nome, tamanho): o que está lá não é o que foi baixado agora.
      return sucesso(
        {
          oportunidade_id: id,
          arquivo_id: g.arquivo_id,
          tipo,
          substituiu: false,
          ja_estava_anexado: false,
          mantido_assinado: true,
          baixado_de: baixadoDe,
          redirecionamentos: baixado.saltos,
          proximo_passo: null,
          avisos: [AVISO_ASSINADO_MANTIDO],
          link,
        },
        { alvo: id }
      );
    }

    const avisos: string[] = [];
    if (g.substituiu) {
      avisos.push(tipo === "pdf" ? AVISO_TROCADO_PDF : AVISO_TROCADO);
    } else {
      // arquivo novo: entra na lista de arquivos da análise do edital (se ela já existe). Falhar aqui não
      // desfaz o anexo: vai ao log (sem ref) e ao aviso
      try {
        await deps.db.rpc("edital_analise_anexar_arquivos", {
          p_oportunidade_id: id,
          p_arquivos: [{ arquivo_oportunidade_id: g.arquivo_id, nome, categoria }],
        });
      } catch (e) {
        logarErro("anexar_edital_por_url", "ligar o edital à análise", e);
        avisos.push(AVISO_SEM_LIGACAO);
      }
    }
    await registrarNoHistorico(
      deps.db,
      id,
      nomeDoUsuario(deps),
      `Edital baixado pelo link pelo Claude: ${nome}`
    );
    return sucesso(
      {
        oportunidade_id: id,
        arquivo_id: g.arquivo_id,
        nome,
        tipo,
        tamanho: g.tamanho,
        categoria,
        substituiu: g.substituiu,
        ja_estava_anexado: false,
        baixado_de: baixadoDe,
        redirecionamentos: baixado.saltos,
        proximo_passo: tipo === "pdf" ? PROXIMO_PASSO_PDF : null,
        avisos,
        link,
      },
      { alvo: id }
    );
  },
};

export const FERRAMENTAS_HABILITACAO: Ferramenta[] = [
  ANEXAR_HABILITACAO,
  ANEXAR_ACERVO,
  ANEXAR_EDITAL_POR_URL,
];
export const INSTRUCOES_HABILITACAO: string[] = [];
export const PROMPTS_HABILITACAO: PromptDef[] = [];
