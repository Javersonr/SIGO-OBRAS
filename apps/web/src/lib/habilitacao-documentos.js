/**
 * Biblioteca de documentos de habilitação (Acervo Técnico → Documentos e certidões).
 * Módulo PURO (sem React, sem banco). Os tipos e as contas de validade são o espelho de
 * supabase/functions/_shared/habilitacao/documentos-regras.ts (paridade em
 * habilitacao-documentos-paridade.test.js): mudou lá, mude aqui.
 */

const t = (id, rotulo, grupo, unico, essencial) => ({ id, rotulo, grupo, unico, essencial });

/** A mesma lista (e ordem) do CHECK de acervo_documento.tipo (migração 0154). */
export const TIPOS_DOCUMENTO = [
  t("cnd_federal", "CND Federal (Receita/PGFN)", "certidao", true, true),
  t("cnd_estadual", "CND Estadual", "certidao", false, true),
  t("cnd_municipal", "CND Municipal", "certidao", false, true),
  t("crf_fgts", "CRF do FGTS", "certidao", true, true),
  t("cndt_trabalhista", "CNDT (Trabalhista)", "certidao", true, true),
  t("certidao_falencia", "Certidão de falência e recuperação judicial", "certidao", true, true),
  t("certidao_crea_pj", "Certidão de registro no CREA (pessoa jurídica)", "certidao", false, false),
  t("certidao_junta", "Certidão simplificada da Junta Comercial", "certidao", true, false),
  t("sicaf", "SICAF ou cadastro de fornecedor", "certidao", false, false),
  t("contrato_social", "Contrato social e alterações", "documento", false, true),
  t("cartao_cnpj", "Cartão CNPJ", "documento", true, true),
  t("inscricao_estadual", "Inscrição estadual", "documento", true, false),
  t("inscricao_municipal", "Inscrição municipal", "documento", true, false),
  t("balanco_dre", "Balanço patrimonial e DRE", "documento", false, false),
  t("alvara", "Alvará de funcionamento", "documento", true, false),
  t("procuracao", "Procuração", "documento", false, false),
  t("documento_representante", "Documento do representante legal", "documento", false, false),
  t("outro", "Outro", "outro", false, false),
];

/** Os blocos da lista e do seletor de tipo, pelo `grupo` do tipo (só a tela usa). */
export const GRUPOS_DOCUMENTO = [
  { id: "certidao", titulo: "Certidões" },
  { id: "documento", titulo: "Documentos da empresa" },
  { id: "outro", titulo: "Outros" },
];

export const IDS_TIPO_DOCUMENTO = TIPOS_DOCUMENTO.map((x) => x.id);
export const TIPOS_ESSENCIAIS = TIPOS_DOCUMENTO.filter((x) => x.essencial).map((x) => x.id);
export const JANELA_VENCE_LOGO_DIAS = 30;

const POR_ID = new Map(TIPOS_DOCUMENTO.map((x) => [x.id, x]));

export function tipoDocumento(id) {
  return typeof id === "string" ? (POR_ID.get(id) ?? null) : null;
}

export function rotuloDoTipo(id) {
  return tipoDocumento(id)?.rotulo ?? "Outro";
}

/** "AAAA-MM-DD" (ou timestamp ISO) → dia em ms UTC; null se não é uma data real (30/02). */
function diaEmMs(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto ?? ""));
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
    return null;
  return ms;
}

/** Dias de `hojeISO` até `validadeISO` (negativo = passou); null se a data não é AAAA-MM-DD real. */
export function diasAte(validadeISO, hojeISO) {
  const fim = diaEmMs(validadeISO);
  const hoje = diaEmMs(hojeISO);
  if (fim === null || hoje === null) return null;
  return Math.round((fim - hoje) / 86_400_000);
}

/** vencido: dias < 0; vence_logo: 0 ≤ dias ≤ janela; valido: dias > janela; sem data: sem_validade. */
export function situacaoDaValidade(validadeISO, hojeISO, janela = JANELA_VENCE_LOGO_DIAS) {
  const dias = diasAte(validadeISO, hojeISO);
  if (dias === null) return { situacao: "sem_validade", dias: null };
  if (dias < 0) return { situacao: "vencido", dias };
  return { situacao: dias <= janela ? "vence_logo" : "valido", dias };
}

const texto = (v) => String(v ?? "").trim();

/**
 * Os documentos ativos que interessam ao "Atende?" (certidões e tudo o que tem validade), no formato
 * de acervo_perfil.certidoes: { tipo, numero, validade }. `tipo` é o rótulo; em tipo que admite
 * vários documentos vai "rótulo — nome", e em "outro" vai só o nome. Ordem: a dos tipos, depois o nome.
 */
export function certidoesDaBiblioteca(docs) {
  const ordem = (d) => {
    const i = IDS_TIPO_DOCUMENTO.indexOf(d.tipo);
    return i < 0 ? IDS_TIPO_DOCUMENTO.length : i;
  };
  return (docs ?? [])
    .filter((d) => d && d.ativo !== false)
    .filter((d) => tipoDocumento(d.tipo)?.grupo === "certidao" || texto(d.validade) !== "")
    .sort((a, b) => ordem(a) - ordem(b) || texto(a.nome).localeCompare(texto(b.nome), "pt-BR"))
    .map((d) => {
      const tipo = tipoDocumento(d.tipo);
      const rotulo =
        !tipo || tipo.id === "outro"
          ? texto(d.nome) || "Outro"
          : tipo.unico
            ? tipo.rotulo
            : `${tipo.rotulo} — ${texto(d.nome)}`;
      return { tipo: rotulo, numero: texto(d.numero) || null, validade: texto(d.validade) || null };
    });
}

const porValidade = (a, b) => String(a.validade).localeCompare(String(b.validade));

/** { vencidos, vencem }: só ativos com validade; vencem = de hoje até hoje + 30 dias; por validade. */
export function pacoteDoMes(docs, hojeISO) {
  const vencidos = [];
  const vencem = [];
  for (const d of docs || []) {
    if (!d || d.ativo === false) continue;
    const { situacao } = situacaoDaValidade(d.validade, hojeISO);
    if (situacao === "vencido") vencidos.push(d);
    else if (situacao === "vence_logo") vencem.push(d);
  }
  return { vencidos: vencidos.sort(porValidade), vencem: vencem.sort(porValidade) };
}

/** Tipo de documento único com exatamente 1 ativo → o id dele (a versão nova o substitui); senão null. */
export function substituidoPadrao(tipo, docs) {
  if (!tipoDocumento(tipo)?.unico) return null;
  const ativos = (docs || []).filter((d) => d && d.tipo === tipo && d.ativo !== false);
  return ativos.length === 1 ? ativos[0].id : null;
}

/** Versões anteriores de `doc` (segue substitui_id), da mais nova para a mais antiga; para em ciclo. */
export function versoesAnteriores(doc, docs) {
  const porId = new Map((docs || []).filter(Boolean).map((d) => [d.id, d]));
  const vistos = new Set([doc?.id]);
  const cadeia = [];
  let atual = porId.get(doc?.substitui_id);
  while (atual && !vistos.has(atual.id)) {
    cadeia.push(atual);
    vistos.add(atual.id);
    atual = porId.get(atual.substitui_id);
  }
  return cadeia;
}

/**
 * Mensagem para a pessoa quando gravar na biblioteca falha. As recusas da cadeia de versões vêm do
 * banco (0154: 23505 do índice acervo_documento_substitui_uidx e 23514 do trigger); o resto cai em
 * "Erro ao salvar" com o texto original, quando houver.
 */
export function mensagemDeErroAoSalvar(erro) {
  const msg = String(erro?.message ?? "");
  if (msg.includes("acervo_documento_substitui_uidx")) {
    return "Este documento já tem uma versão nova. Atualize a página e confira a lista.";
  }
  if (msg.includes("não está em vigor")) {
    return "O documento escolhido para substituir não está mais em vigor. Atualize a página.";
  }
  if (msg.includes("mesmo tipo")) {
    return "A versão nova tem de ser do mesmo tipo do documento substituído.";
  }
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return "Você não tem permissão para gravar na biblioteca (Oportunidades → Lista → editar).";
  }
  return "Erro ao salvar" + (msg ? `: ${msg}` : "");
}

const aparar = (v) => String(v ?? "").trim();
// diasAte aceita timestamp; o formulário só aceita a data inteira AAAA-MM-DD
const dataValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && diasAte(v, "2000-01-01") !== null;

/** Formulário da gaveta → { ok, erros, dados } (dados já aparados; vazio vira null). */
export function validarDocumento(form) {
  const f = form || {};
  const erros = [];
  const nome = aparar(f.nome);
  const emissao = aparar(f.emissao);
  const validade = aparar(f.validade);
  if (!tipoDocumento(f.tipo)) erros.push("Escolha o tipo do documento");
  if (!nome) erros.push("Informe o nome do documento");
  else if (nome.length > 200) erros.push("Nome: use até 200 caracteres");
  if (!aparar(f.arquivo_ref)) erros.push("Anexe o arquivo (PDF ou imagem)");
  if (emissao && !dataValida(emissao)) erros.push("Emissão: use uma data válida");
  if (validade && !dataValida(validade)) erros.push("Validade: use uma data válida");
  if (emissao && validade && dataValida(emissao) && dataValida(validade) && validade < emissao) {
    erros.push("A validade não pode ser anterior à emissão");
  }
  return {
    ok: erros.length === 0,
    erros,
    dados: {
      tipo: f.tipo,
      nome,
      arquivo_ref: aparar(f.arquivo_ref),
      numero: aparar(f.numero) || null,
      orgao_emissor: aparar(f.orgao_emissor) || null,
      emissao: emissao || null,
      validade: validade || null,
      observacao: aparar(f.observacao) || null,
    },
  };
}
