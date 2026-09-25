/**
 * edital — ações de leitura de edital e "Atende?" da ia-processar
 * (contrato das ações no cabeçalho do index.ts).
 *
 * Orçamento de tempo: a edge corta em 150 s; somando as chamadas ao modelo
 * nunca passamos de ~120 s (AbortSignal.timeout + corte do escalonamento).
 *
 * Consumo: cada ação recebe um MedidorUso (ia-uso.ts) e soma nele o usage de
 * TODA chamada à OpenAI (ok ou não); o index grava em ia_uso e aplica a cota.
 */
import { fail, ok } from "../_shared/cors.ts";
import {
  chamarOpenAI,
  lerConfigOpenAI,
  MODELO_FORTE,
  type RespostaOpenAI,
} from "../_shared/openai.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import {
  SCHEMA_ATENDE_TECNICO,
  schemaEdital,
  type EditalConsolidado,
  type RespostaTecnica,
} from "./edital-schemas.ts";
import {
  apelidarAtestados,
  arr,
  blocoAcervo,
  blocoExigencias,
  calcularTotais,
  completarNulos,
  contarPreenchidos,
  dedupTextos,
  detalhesRelevantes,
  ehErrata,
  juntarParciais,
  limparPaginas,
  montarAtende,
  obj,
  motivosFraca,
  origemDaParcial,
  renumerarIds,
  rotuloOrigem,
  sanearEdital,
  texto,
  type Acervo,
  type AcervoAtestado,
  type AcervoPerfil,
  type AcervoProfissional,
  type AcervoQuantitativo,
  type Juncao,
  type MotivoFraca,
} from "./edital-regras.ts";
import { contabilizar, type MedidorUso } from "./ia-uso.ts";

type Obj = Record<string, unknown>;
type Usuario = { email: string; is_super_admin: boolean; empresa_id: string | null };

const ORCAMENTO_MS = 120_000; // soma máxima das chamadas ao modelo numa requisição
const TIMEOUT_1A_MS = 100_000; // 1ª tentativa da extração
const ESCALONA_ATE_MS = 60_000; // 1ª tentativa passou disso → não tenta o modelo forte
const TIMEOUT_UNICA_MS = 110_000; // consolidação / atende (uma chamada só)
const LIMITE_TEXTO_PARTE = 300_000; // caracteres por parte (~75-100 mil tokens)
const LIMITE_PAGINAS_PARTE = 300;
const LIMITE_IMAGENS = 30;
const LIMITE_DATA_URL = 8 * 1024 * 1024; // por imagem (base64)
const LIMITE_IMAGENS_TOTAL = 30 * 1024 * 1024; // soma das imagens da parte
const LIMITE_JSON = 3_000_000;

const GRUPOS = [
  "tecnica_operacional",
  "tecnica_profissional",
  "economica",
  "registros",
  "outros_documentos",
] as const;

function falhaIA(r: { erro: string }) {
  return r.erro === "IA_NAO_CONFIGURADA"
    ? fail("IA não configurada — defina a chave no SaaS Admin → Integrações", 503)
    : fail(r.erro, 502);
}

function inteiroPositivo(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** "AAAA-MM-DD" no fuso de Brasília (validade de certidão, sessão) */
function hojeBR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** todas as "pagina" numéricas de uma estrutura (para validar a saída do modelo) */
function paginasCitadas(v: unknown, out = new Set<number>()): Set<number> {
  if (Array.isArray(v)) for (const x of v) paginasCitadas(x, out);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Obj)) {
      if (k === "pagina" && typeof x === "number") out.add(x);
      else if (x && typeof x === "object") paginasCitadas(x, out);
    }
  }
  return out;
}

// ─── edital_extrair_parte ───────────────────────────────────────────────────

function promptExtracao(nome: string, parte: number, total: number, errata: boolean): string {
  return [
    "Você é analista de licitações de uma empresa brasileira de engenharia elétrica e construção (redes de distribuição, iluminação pública, obras).",
    `Abaixo está a PARTE ${parte} de ${total} do arquivo "${nome}"${errata ? " — ERRATA/RETIFICAÇÃO: o que estiver aqui substitui o edital original" : ""}, página a página, com marcadores "=== PÁGINA n ===". Páginas escaneadas vêm como imagem, cada uma precedida do seu marcador.`,
    "",
    "Preencha o JSON SOMENTE com o que está escrito NESTAS páginas:",
    "- NÃO invente nem deduza: o que não estiver escrito fica null; lista sem ocorrência fica [].",
    '- "pagina" = o n do marcador "=== PÁGINA n ===" onde a informação aparece (em toda data, exigência e observação).',
    "- Datas em AAAA-MM-DD; horas em HH:MM (24 h). Valores em número: 1.234.567,89 → 1234567.89. Percentuais em pontos: 10% → 10.",
    '- "trecho": copie o trecho do edital que fundamenta a exigência (até ~300 caracteres).',
    '- ids das exigências: "op1","op2"… (operacional), "pr1"… (profissional), "ec1"… (econômica), "rg1"… (registros).',
    "",
    "O QUE MAIS IMPORTA (decide se a empresa pode participar):",
    "1. QUALIFICAÇÃO TÉCNICA — separe:",
    '   • tecnica_operacional = capacidade técnico-OPERACIONAL: atestados em nome da EMPRESA licitante. Uma entrada por parcela de maior relevância/serviço: servico, quantidade MÍNIMA exigida e unidade; percentual_minimo quando o edital fala em % (ex.: "50% do quantitativo") — se o edital der só o total da parcela e o %, calcule quantidade = total × %; somatorio_permitido (true = aceita somar atestados; false = exige atestado único ou veda somatório; null = não diz); exige_execucao (true quando exige EXECUÇÃO — projeto, fiscalização ou consultoria não bastam).',
    "   • tecnica_profissional = capacidade técnico-PROFISSIONAL: CAT/acervo do PROFISSIONAL de nível superior do quadro da empresa (ex.: engenheiro eletricista), com a formação em profissional e serviço/quantidade se houver.",
    '   "Atestado em nome da licitante" = operacional; "CAT do responsável técnico/profissional" = profissional.',
    '2. QUALIFICAÇÃO ECONÔMICO-FINANCEIRA (economica): capital social mínimo (capital_social), patrimônio líquido mínimo (patrimonio_liquido) ou "capital social OU patrimônio líquido" (capital_ou_pl) — com valor_minimo em R$ e/ou percentual_do_estimado; índices liquidez_corrente, liquidez_geral e solvencia_geral (valor_minimo = índice mínimo, ex.: 1.0) e endividamento (valor_minimo = índice MÁXIMO); ccl (capital circulante líquido); faturamento (valor e exercicio). Balanço, certidão de falência e demais documentos vão em outros_documentos.',
    "3. REGISTROS: registro da empresa no CREA/CAU (crea), visto no CREA do estado (visto_crea), cadastro/credenciamento em concessionária de energia (cadastro_concessionaria), outros (outro).",
    '4. PRAZOS: sessão pública/abertura (sessao), limite de propostas (proposta_limite), impugnação (impugnacao_limite), esclarecimentos (esclarecimento_limite) e visita técnica (obrigatória ou facultativa, data, hora e, em descricao, local/como agendar). Prazo relativo ("até 3 dias úteis antes da sessão") → data null e explique em observacoes_importantes.',
    "5. Também: garantia de proposta, exclusividade ME/EPP, consórcio, subcontratação, critério de julgamento, regime e prazo de execução, vigência, valor estimado, órgão e CNPJ, nº do edital e do processo, modalidade, forma (eletrônica/presencial), portal (plataforma/link da disputa) e local (cidade/UF).",
    "6. itens: lotes/itens da planilha com quantidade, unidade e valores (no máximo 80 linhas; se houver mais, fique com os de maior valor e registre em avisos).",
    '- titulo_sugerido: curto (até 80 caracteres), ex.: "Iluminação pública LED — Pref. de Araxá/MG" (só se o objeto aparecer nestas páginas).',
    "- observacoes_importantes: só o que muda a decisão ou o preparo (amostra, exigência incomum, penalidade atípica, prazo relativo) — no máximo 15.",
    "- avisos: problemas de leitura (página ilegível, tabela cortada).",
    "- paginas_lidas: quantas páginas você recebeu.",
  ].join("\n");
}

const limparTexto = (t: string) =>
  t
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function editalExtrairParte(body: Obj, medidor?: MedidorUso): Promise<Response> {
  const nome = texto(body.nome_arquivo, 300) ?? "edital.pdf";
  const parte = inteiroPositivo(body.parte) ?? 1;
  const total = Math.max(parte, inteiroPositivo(body.total_partes) ?? 1);
  const errata = ehErrata(nome);

  const paginasIn = arr(body.paginas);
  const imagensIn = arr(body.imagens);
  if (!paginasIn.length && !imagensIn.length) return fail("paginas é obrigatório", 400);
  if (paginasIn.length > LIMITE_PAGINAS_PARTE) {
    return fail(
      `Parte com páginas demais (máx. ${LIMITE_PAGINAS_PARTE}) — divida em partes menores`,
      413
    );
  }
  if (imagensIn.length > LIMITE_IMAGENS)
    return fail(`No máximo ${LIMITE_IMAGENS} imagens por parte`, 413);

  const paginas: { n: number; texto: string }[] = [];
  for (const y of paginasIn) {
    const p = obj(y);
    const n = inteiroPositivo(p.n);
    if (!n) return fail("Cada página precisa de n (inteiro ≥ 1)", 400);
    paginas.push({ n, texto: typeof p.texto === "string" ? limparTexto(p.texto) : "" });
  }
  paginas.sort((a, b) => a.n - b.n);
  const imagens: { n: number; url: string }[] = [];
  for (const y of imagensIn) {
    const i = obj(y);
    const n = inteiroPositivo(i.n);
    const url = typeof i.data_url === "string" ? i.data_url : "";
    if (!n || !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(url)) {
      return fail('imagens: cada item precisa de n e data_url "data:image/jpeg;base64,..."', 400);
    }
    if (url.length > LIMITE_DATA_URL)
      return fail(`Imagem da página ${n} grande demais — reduza a resolução`, 413);
    imagens.push({ n, url });
  }
  if (imagens.reduce((s, i) => s + i.url.length, 0) > LIMITE_IMAGENS_TOTAL) {
    return fail(
      "Imagens desta parte somam mais de 30MB — reduza a resolução ou divida a parte",
      413
    );
  }
  const textoTotal = paginas.map((p) => p.texto).join("\n");
  if (textoTotal.length > LIMITE_TEXTO_PARTE) {
    return fail(
      `Parte grande demais (${textoTotal.length} caracteres; máx. ${LIMITE_TEXTO_PARTE}) — divida em partes menores`,
      413
    );
  }

  const comImagem = new Set(imagens.map((i) => i.n));
  const blocos = paginas.map(
    (p) =>
      `=== PÁGINA ${p.n} ===\n${p.texto || (comImagem.has(p.n) ? `(página escaneada — ver a imagem da PÁGINA ${p.n})` : "(sem texto)")}`
  );
  const inputsExtras = imagens.flatMap((i) => [
    { type: "input_text", text: `=== PÁGINA ${i.n} (imagem) ===` },
    { type: "input_image", image_url: i.url, detail: "high" },
  ]);
  const prompt = `${promptExtracao(nome, parte, total, errata)}\n\n${blocos.join("\n\n")}`;
  const validas = new Set([...paginas.map((p) => p.n), ...imagens.map((i) => i.n)]);
  const avisosCodigo = paginas
    .filter((p) => p.texto.length < 30 && !comImagem.has(p.n))
    .map((p) => `Página ${p.n} sem texto legível e sem imagem (escaneada?) — confira no PDF.`);

  // escalonamento: econômico → forte, dentro do orçamento de tempo
  const { modelo } = await lerConfigOpenAI();
  const cadeia = [...new Set([modelo, MODELO_FORTE])];
  const inicio = Date.now();
  let melhor: { ed: EditalConsolidado; pontos: number; modelo: string } | null = null;
  let ultimoErro: RespostaOpenAI | null = null;
  // "fraca" que o modelo FORTE também devolveu (lista vazia confirmada): não
  // vira aviso de leitura incompleta — a menção no texto não era exigência
  const confirmadosForte = new Set<MotivoFraca>();
  for (let i = 0; i < cadeia.length; i++) {
    const decorrido = Date.now() - inicio;
    if (i > 0 && decorrido > ESCALONA_ATE_MS) break; // o 1º já comeu o tempo
    const r = await chamarOpenAI({
      prompt,
      inputsExtras,
      jsonSchema: schemaEdital(),
      nomeSchema: "edital_parcial",
      strict: true,
      modelo: cadeia[i],
      timeoutMs: i === 0 ? TIMEOUT_1A_MS : Math.min(TIMEOUT_1A_MS, ORCAMENTO_MS - decorrido),
      maxOutputTokens: 12_000,
      esforco: "low",
    });
    contabilizar(medidor, r, cadeia[i]);
    if (!r.ok) {
      if (r.erro === "IA_NAO_CONFIGURADA") return falhaIA(r);
      ultimoErro = r;
      console.warn("[ia-processar] edital_extrair_parte", cadeia[i], r.erro);
      continue; // erro/timeout/cortada → tenta o forte, se der tempo
    }
    const ed = sanearEdital(r.resultado);
    limparPaginas(ed, validas);
    const { avisos: _a, paginas_lidas: _p, ...util } = ed;
    const pontos = contarPreenchidos(util);
    if (!melhor || pontos > melhor.pontos) melhor = { ed, pontos, modelo: r.modelo };
    const motivos = motivosFraca(ed, textoTotal, imagens.length > 0);
    if (r.modelo === MODELO_FORTE) {
      for (const m of motivos) if (m !== "quase_vazia") confirmadosForte.add(m);
    }
    if (!motivos.length) break;
  }
  if (!melhor) return falhaIA(ultimoErro ?? { erro: "IA indisponível" });

  const ed = renumerarIds(melhor.ed);
  ed.paginas_lidas = validas.size;
  const faixa = `${Math.min(...validas)}–${Math.max(...validas)}`;
  const incompleta = motivosFraca(ed, textoTotal, imagens.length > 0).some(
    (m) => !confirmadosForte.has(m)
  );
  ed.avisos = dedupTextos([
    ...ed.avisos,
    ...avisosCodigo,
    ...(incompleta
      ? [`Leitura possivelmente incompleta nas páginas ${faixa} de ${nome} — confira.`]
      : []),
  ]).slice(0, 60);
  // _origem: extensão do contrato — o consolidar usa para dar prioridade à errata
  const resultado = { ...ed, _origem: { nome_arquivo: nome, parte, total_partes: total, errata } };
  return ok({ resultado, modelo: melhor.modelo });
}

// ─── edital_consolidar ──────────────────────────────────────────────────────

function promptConsolidacao(arquivos: string[], conflitos: string[]): string {
  return [
    "Você consolida a leitura de um edital de licitação feita em várias partes (páginas/arquivos) num único JSON final.",
    `Arquivos lidos: ${arquivos.join("; ") || "(não informados)"}.`,
    'Você recebe o RASCUNHO (junção automática das partes, já sem repetições exatas; cada exigência traz "origem" = arquivo/parte de onde veio) e os CONFLITOS detectados.',
    "Regras:",
    "- Mantenha TODAS as exigências distintas. Junte só as que são a MESMA exigência repetida (mesmo serviço/tipo; uma igual ou mais completa que a outra): fique com a versão mais completa, a menor página e o trecho mais informativo. Parcelas diferentes (ex.: postes × luminárias × rede) continuam separadas.",
    '- Conflitos de datas, valores e regras: prefira a ERRATA/retificação e a informação mais específica (data com hora > sem hora; aviso/preâmbulo > menção genérica). Registre em avisos cada conflito e como resolveu (ex.: "Sessão: 10/10/2026 09:00 (errata p. 2) substitui 05/10/2026 (edital p. 1)").',
    "- Não invente nada fora do rascunho; campo sem informação = null. Não crie exigências novas.",
    "- titulo_sugerido curto (até 80 caracteres) a partir do objeto.",
    '- Copie "pagina" e "trecho" do rascunho; mantenha os ids como estão (serão renumerados depois).',
    '- O campo "origem" é só informativo: não faz parte da resposta.',
    "",
    "CONFLITOS:",
    ...(conflitos.length
      ? conflitos.map((c) => `- ${c}`)
      : ["- nenhum conflito de data/valor; verifique só exigências repetidas"]),
  ].join("\n");
}

/** rascunho sem itens (juntados em código) e com a origem de cada exigência */
function rascunhoParaModelo(j: Juncao): Obj {
  const h = j.rascunho.habilitacao;
  const comOrigem = <T extends object>(l: T[]) =>
    l.map((x) => ({ ...x, origem: j.origens.get(x) ?? null }));
  const { itens: _i, paginas_lidas: _p, ...resto } = j.rascunho;
  return {
    ...resto,
    habilitacao: {
      tecnica_operacional: comOrigem(h.tecnica_operacional),
      tecnica_profissional: comOrigem(h.tecnica_profissional),
      economica: comOrigem(h.economica),
      registros: comOrigem(h.registros),
      outros_documentos: h.outros_documentos,
    },
  };
}

export async function editalConsolidar(body: Obj, medidor?: MedidorUso): Promise<Response> {
  const brutas = arr(body.parciais).filter((x) => x && typeof x === "object");
  if (!brutas.length) return fail("parciais é obrigatório", 400);
  if (brutas.length > 200) return fail("Parciais demais (máx. 200)", 413);
  if (JSON.stringify(brutas).length > LIMITE_JSON)
    return fail("Parciais grandes demais para consolidar", 413);
  const nomes = dedupTextos(arr(body.nomes_arquivos), 300);
  // sem _origem e 1 parcial por arquivo → casa pelo índice
  const nomesBrutos = arr(body.nomes_arquivos).map((n) => texto(n, 300));
  const parciais = brutas.map((x, i) => ({
    edital: sanearEdital(x),
    origem: origemDaParcial(x, nomesBrutos.length === brutas.length ? nomesBrutos[i] : null),
  }));
  const j = juntarParciais(parciais);

  const precisaModelo = parciais.length > 1 && (j.conflitos.length > 0 || j.suspeitas > 0);
  if (!precisaModelo) {
    const r = renumerarIds(j.rascunho);
    r.avisos = dedupTextos([...r.avisos, ...j.conflitos]).slice(0, 60);
    return ok({ resultado: r, modelo: "regras" });
  }

  const arquivos = nomes.length
    ? nomes.map((n) => (ehErrata(n) ? `${n} (errata)` : n))
    : [
        ...new Set(
          parciais.map((p) => rotuloOrigem(p.origem) + (p.origem.errata ? " (errata)" : ""))
        ),
      ];
  const prompt = `${promptConsolidacao(arquivos, j.conflitos)}\n\nRASCUNHO (JSON):\n${JSON.stringify(rascunhoParaModelo(j))}`;
  const r = await chamarOpenAI({
    prompt,
    jsonSchema: schemaEdital({ semItens: true }),
    nomeSchema: "edital_consolidado",
    strict: true,
    modelo: MODELO_FORTE,
    timeoutMs: TIMEOUT_UNICA_MS,
    maxOutputTokens: 12_000,
    esforco: "low",
  });
  contabilizar(medidor, r, MODELO_FORTE);
  if (!r.ok) {
    if (r.erro === "IA_NAO_CONFIGURADA") return falhaIA(r);
    // sem o modelo, a junção em código já é um resultado válido (nada se perde)
    console.warn("[ia-processar] edital_consolidar", r.erro);
    const base = renumerarIds(j.rascunho);
    base.avisos = dedupTextos([
      ...base.avisos,
      ...j.conflitos,
      `Consolidação feita sem IA (${r.erro}) — pode haver exigências repetidas; revise.`,
    ]).slice(0, 60);
    return ok({ resultado: base, modelo: "regras" });
  }

  const final = sanearEdital(r.resultado);
  limparPaginas(final, paginasCitadas(j.rascunho));
  // o modelo não pode "perder" dado: nulo no final e preenchido no rascunho volta
  completarNulos(final as unknown as Obj, j.rascunho as unknown as Obj);
  final.itens = j.rascunho.itens;
  final.paginas_lidas = j.rascunho.paginas_lidas;
  const avisosExtras: string[] = [];
  for (const g of GRUPOS) {
    const doModelo = final.habilitacao[g] as unknown[];
    const doRascunho = j.rascunho.habilitacao[g] as unknown[];
    if (!doModelo.length && doRascunho.length) {
      (final.habilitacao as Record<string, unknown[]>)[g] = doRascunho;
      avisosExtras.push(
        `A consolidação esvaziou ${g}; mantidas as ${doRascunho.length} exigência(s) lidas nas partes.`
      );
    }
  }
  final.avisos = dedupTextos([...final.avisos, ...avisosExtras, ...j.rascunho.avisos]).slice(0, 60);
  return ok({ resultado: renumerarIds(final), modelo: r.modelo });
}

// ─── edital_atende ──────────────────────────────────────────────────────────

function promptAtende(empresa: string, ids: string[]): string {
  return [
    `Você é o analista de habilitação da empresa ${empresa}. Decida, exigência por exigência, se o ACERVO da empresa atende à qualificação TÉCNICA e aos REGISTROS do edital (o econômico-financeiro já foi calculado pelo sistema — não avalie).`,
    'Use SOMENTE o acervo listado. Os atestados são identificados por códigos ENTRE COLCHETES: [AT1], [AT2]… Em "atestados" e em cats_anexar cite apenas esses códigos; no texto (comprovacao, justificativa, pendencias, riscos) escreva o código sempre com os colchetes, ex.: "[AT3]" — nunca A3/AT3 soltos (A1…A4 são grupos tarifários). Não invente CAT, quantidade ou profissional.',
    `Responda UM item para CADA exigência: ${ids.join(", ")}.`,
    "",
    "REGRAS (siga à risca):",
    '1. Somatório × atestado único: somatório PERMITIDO → compare com os TOTAIS (somatório das CATs); VEDADO → compare com o TETO POR OBRA ÚNICA; edital não diz → compare primeiro com o teto por obra única e, se só atender somando atestados, use "ressalva" (depende de o edital aceitar somatório).',
    '2. exige execução = sim: CAT sem execução na ART (só projeto/consultoria/fiscalização/assessoria) NÃO comprova — "nao_atende" se for a única prova; cite o motivo.',
    '3. Quantidade na atividade técnica da ART (marcada [ART] ou em "atividade técnica da ART") vale mais do que a que aparece só na observação/planilha; se a prova depender só da observação, use "ressalva".',
    '4. CAT EM ANDAMENTO ou com divergência conhecida (campo riscos) que afete a prova ⇒ no máximo "ressalva", citando o risco.',
    "5. Tipo cat_profissional (obra executada por OUTRA empresa) só vale para capacidade técnico-PROFISSIONAL e só se o profissional tiver vínculo com a empresa (quadro técnico); NUNCA para técnico-operacional.",
    '6. Tipo atestado (sem CAT) só vale se o edital aceitar atestado sem registro no CREA; se o edital não disser, "ressalva".',
    "7. CAO comprova o acervo operacional apenas das ARTs que cobre.",
    "8. Quantidade mínima: use a quantidade exigida. Se o edital não fixar, registre na justificativa que a Lei 14.133/2021 (art. 67, §§ 1º e 2º) limita a exigência às parcelas de maior relevância e a até 50% do quantitativo delas.",
    '9. Compare unidades compatíveis (1 km = 1.000 m). Luminária de IP, refletor e substituição de luminária são categorias diferentes; serviço similar ou de complexidade superior só conta se o edital aceitar — na dúvida, "ressalva" explicando.',
    "10. Técnico-profissional: confira o quadro técnico (formação exigida, RT, vínculo, restrições) e se há CAT em nome do profissional com o serviço/quantidade.",
    "11. Registros: CREA da empresa; visto no CREA da UF da licitação quando a empresa é de outra UF (em regra só para contratar — trate como ressalva/pendência, salvo se o edital exigir na habilitação); cadastro na concessionária: confira órgão, grupos e validades dos cadastros.",
    "12. Considere as OBSERVAÇÕES/REGRAS e os ALERTAS da empresa (o que ela NÃO tem, melhores CATs por serviço).",
    '13. status: "atende" (comprovado), "ressalva" (atende com risco/condição), "nao_atende" (o acervo não tem), "verificar" (faltam dados para decidir).',
    '14. comprovacao: objetiva, com o nº da CAT e a quantidade (ex.: "CAT 3239747/2025 – Planura: 157 postes (teto por obra)"); justificativa: 1 a 3 frases.',
    "15. cats_anexar: CATs/CAO/atestados a juntar na habilitação e o motivo. pendencias: providências antes da sessão. riscos: pontos que podem inabilitar.",
  ].join("\n");
}

type Consulta = (
  de: number,
  ate: number
) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** PostgREST devolve no máx. 1000 linhas por chamada: pagina até acabar */
async function buscarTodos(consulta: Consulta): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(`Falha ao ler o acervo: ${error.message}`);
    out.push(...((data ?? []) as Obj[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function carregarAcervo(empresaId: string): Promise<{ acervo: Acervo; empresa: Obj | null }> {
  const sb = createAdminClient();
  const [perfilR, empresaR, profissionais, atestados, quantitativos] = await Promise.all([
    sb
      .from("acervo_perfil")
      .select("*")
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1),
    sb.from("empresa").select("id, nome, razao_social, estado").eq("id", empresaId).maybeSingle(),
    buscarTodos((de, ate) =>
      sb
        .from("acervo_profissional")
        .select(
          "id, nome, registro, titulos, atribuicoes, restricoes, vinculo_desde, responsavel_tecnico, ativo, observacoes"
        )
        .eq("empresa_id", empresaId)
        .is("deleted_at", null)
        .order("nome")
        .order("id")
        .range(de, ate)
    ),
    buscarTodos((de, ate) =>
      sb
        .from("acervo_atestado")
        .select(
          "id, tipo, numero, conselho, art_numero, contratante, valor, data_inicio, data_fim, objeto, cidade, uf, codigos_crea, atividades, com_execucao, situacao, profissional_nome, empresa_executora, cobre_arts, riscos, ordem"
        )
        .eq("empresa_id", empresaId)
        .is("deleted_at", null)
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("id")
        .range(de, ate)
    ),
    buscarTodos((de, ate) =>
      sb
        .from("acervo_quantitativo")
        .select(
          "atestado_id, categoria, descricao, quantidade, unidade, especificacao, na_atividade_tecnica, observacao, ordem"
        )
        .eq("empresa_id", empresaId)
        .is("deleted_at", null)
        .order("atestado_id")
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("id")
        .range(de, ate)
    ),
  ]);
  if (perfilR.error) throw new Error(`Falha ao ler o acervo: ${perfilR.error.message}`);
  const atestadosDaEmpresa = atestados as unknown as AcervoAtestado[];
  const ids = new Set(atestadosDaEmpresa.map((a) => a.id));
  return {
    acervo: {
      perfil: ((perfilR.data ?? [])[0] as AcervoPerfil | undefined) ?? null,
      profissionais: profissionais as unknown as AcervoProfissional[],
      atestados: atestadosDaEmpresa,
      // quantitativo só de atestado desta empresa (defesa extra)
      quantitativos: (quantitativos as unknown as AcervoQuantitativo[]).filter((q) =>
        ids.has(q.atestado_id)
      ),
    },
    empresa: (empresaR.data as Obj | null) ?? null,
  };
}

/** ids vindos do front: se faltarem/repetirem, renumera (senão preserva p/ casar com o front) */
function garantirIds(e: EditalConsolidado): void {
  const h = e.habilitacao;
  const todos = [
    ...h.tecnica_operacional,
    ...h.tecnica_profissional,
    ...h.economica,
    ...h.registros,
  ].map((x) => x.id);
  if (todos.some((id) => !id) || new Set(todos).size !== todos.length) renumerarIds(e);
}

export async function editalAtende(
  body: Obj,
  usuario: Usuario,
  medidor?: MedidorUso
): Promise<Response> {
  // empresa SEMPRE do token — nunca do corpo
  const empresaId = usuario.empresa_id;
  if (!empresaId)
    return fail("Sessão sem empresa ativa — selecione a empresa e tente de novo", 400);
  if (!body.extraido || typeof body.extraido !== "object")
    return fail("extraido é obrigatório", 400);
  if (JSON.stringify(body.extraido).length > LIMITE_JSON)
    return fail("extraido grande demais", 413);
  const extraido = sanearEdital(body.extraido);
  garantirIds(extraido);

  const { acervo, empresa: emp } = await carregarAcervo(empresaId);
  if (!acervo.perfil && !acervo.atestados.length && !acervo.profissionais.length) {
    return fail("Cadastre o acervo da empresa (Oportunidades → Acervo técnico)", 422, {
      codigo: "SEM_ACERVO",
    });
  }
  const empresa = {
    id: empresaId,
    nome: texto(emp?.nome, 200) ?? texto(emp?.razao_social, 200),
    uf: (texto(emp?.estado, 2) ?? "").toUpperCase() || null,
  };
  const apelidos = apelidarAtestados(acervo.atestados);
  const h = extraido.habilitacao;
  const idsTecnicos = [...h.tecnica_operacional, ...h.tecnica_profissional, ...h.registros].map(
    (x) => x.id
  );

  let resposta: RespostaTecnica | null = null;
  let modelo = "regras";
  if (idsTecnicos.length) {
    const totais = calcularTotais(acervo, apelidos);
    const detalhes = detalhesRelevantes(acervo, apelidos, extraido);
    const prompt = [
      promptAtende(empresa.nome ?? "licitante", idsTecnicos),
      "",
      "════ EDITAL ════",
      blocoExigencias(extraido),
      "",
      "════ ACERVO DA EMPRESA ════",
      blocoAcervo(acervo, apelidos, totais, empresa, detalhes),
    ].join("\n");
    const r = await chamarOpenAI({
      prompt,
      jsonSchema: SCHEMA_ATENDE_TECNICO,
      nomeSchema: "atende_tecnico",
      strict: true,
      modelo: MODELO_FORTE,
      timeoutMs: TIMEOUT_UNICA_MS,
      maxOutputTokens: 8_000,
      esforco: "low",
    });
    contabilizar(medidor, r, MODELO_FORTE);
    if (!r.ok) return falhaIA(r);
    const o = obj(r.resultado);
    resposta = {
      itens: arr(o.itens).filter((x) => x && typeof x === "object") as RespostaTecnica["itens"],
      cats_anexar: arr(o.cats_anexar).filter(
        (x) => x && typeof x === "object"
      ) as RespostaTecnica["cats_anexar"],
      pendencias: arr(o.pendencias).map(String),
      riscos: arr(o.riscos).map(String),
    };
    modelo = r.modelo;
  }

  const resultado = montarAtende({
    extraido,
    acervo,
    apelidos,
    empresa,
    resposta,
    modelo,
    agoraISO: new Date().toISOString(),
    hojeISO: hojeBR(),
  });
  return ok({ resultado });
}
