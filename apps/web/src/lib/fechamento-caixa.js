/**
 * Fechamento de caixa (fundo fixo) — funções puras das telas do fluxo
 * (PreLancamentosAReconciliar, AcrescentarPreLancamentoModal, FechamentoCaixaModal e
 * HistoricoFechamentosCaixa).
 *
 * As gravações são as RPCs da migração 0158 (fechar_caixa, acrescentar_ao_fechamento,
 * aprovar_pagamento_fechamento, desfazer_pagamento_fechamento, desfazer_fechamento_caixa).
 * Aqui ficam só: a mensagem de erro em português, o valor do pré-lançamento igual ao que o
 * banco soma, as datas (data_fechamento/data_pagamento são timestamptz) e a sugestão da
 * conta do fundo fixo que recebe a reposição.
 */
import { safeParseJSON } from "./json-utils";
import { diaBrasilia } from "./data-brasilia";

const SEM_FUNCAO = /could not find the function/i;
const SEM_REDE = /failed to fetch|networkerror|network request failed|load failed/i;

/**
 * Mensagem para o usuário a partir do erro de uma RPC do fechamento. As exceções do SQL já
 * vêm em português e são repassadas como estão; só os erros de infraestrutura (função que
 * ainda não existe no banco, sem rede) ganham texto próprio.
 */
export function mensagemErroFechamento(err) {
  if (!err) return "Erro desconhecido.";
  const msg = typeof err === "string" ? err : err.message || "";
  const codigo = typeof err === "object" ? err.code : undefined;
  if (codigo === "PGRST202" || SEM_FUNCAO.test(msg)) {
    return "Esta operação precisa de uma atualização do banco de dados (migração 0158) que ainda não foi aplicada. Avise o administrador do sistema.";
  }
  if (SEM_REDE.test(msg)) {
    return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  }
  return msg || "Erro desconhecido.";
}

/**
 * Número no formato do banco (_numero_br da 0155): com vírgula é "1.234,56"; sem vírgula é
 * "1234.56". Vazio ou inválido → null.
 */
export function numeroBr(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let texto = String(valor ?? "").trim();
  if (!texto) return null;
  if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valor do pré-lançamento como o banco soma no fechamento (_pre_lancamento_valor da 0158):
 * dados_extraidos.valor, aceitando o legado gravado como string JSON (até dentro de outra).
 * `parseFloat("1.234,56")` dava 1,234 — o total da tela não batia com o do fechamento.
 */
export function valorDoPreLancamento(pl) {
  let dados = safeParseJSON(pl?.dados_extraidos, {});
  if (typeof dados === "string") dados = safeParseJSON(dados, {});
  if (!dados || typeof dados !== "object") return 0;
  return numeroBr(dados.valor) ?? 0;
}

const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
// data escolhida pelo usuário e gravada num timestamptz: meia-noite (em qualquer fuso)
const MEIA_NOITE =
  /^(\d{4})-(\d{2})-(\d{2})[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;

// "AAAA-MM-DD" quando o valor é um dia (data pura ou meia-noite); null quando é um instante
function diaEscolhido(valor) {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  const m = SO_DATA.exec(texto) || MEIA_NOITE.exec(texto);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Data de um fechamento para exibir (DD/MM/AAAA). data_fechamento e data_pagamento são
 * timestamptz: a data escolhida na tela chega como meia-noite e é mostrada como foi escolhida;
 * o instante gravado pelo fechar_caixa (now()) é mostrado no dia de Brasília. Antes a tela
 * fazia `new Date(valor + "T12:00:00")`, que com timestamptz virava "Invalid Date".
 */
export function dataDoFechamento(valor) {
  if (valor === null || valor === undefined || valor === "") return "-";
  const dia = diaEscolhido(valor);
  if (dia) {
    const [ano, mes, d] = dia.split("-");
    return `${d}/${mes}/${ano}`;
  }
  const texto = diaBrasilia(valor);
  return texto === "—" ? "-" : texto;
}

/** Mesma data no formato do <input type="date"> (AAAA-MM-DD); vazio se inválida. */
export function dataDoFechamentoParaInput(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const dia = diaEscolhido(valor);
  if (dia) return dia;
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const normEmail = (e) => (e || "").trim().toLowerCase();

/**
 * Conta do fundo fixo sugerida para receber a reposição: a já gravada no fechamento; senão o
 * único "Fundo Fixo" cujo responsável é quem lançou todos os itens; senão o único "Fundo Fixo"
 * da empresa. Sem certeza, "" (o usuário escolhe).
 */
export function sugerirContaFundo(contas, itens, contaAtualId) {
  const lista = Array.isArray(contas) ? contas : [];
  if (contaAtualId && lista.some((c) => c.id === contaAtualId)) return contaAtualId;
  const fundos = lista.filter((c) => c.tipo === "Fundo Fixo");
  const emails = [...new Set((itens || []).map((pl) => normEmail(pl?.usuario_email)))].filter(
    Boolean
  );
  if (emails.length === 1) {
    const doResponsavel = fundos.filter((c) => normEmail(c.responsavel_email) === emails[0]);
    if (doResponsavel.length === 1) return doResponsavel[0].id;
  }
  if (fundos.length === 1) return fundos[0].id;
  return "";
}

/**
 * Receita de reposição criada pelo sistema antigo (antes da 0158 não havia
 * transferencia_id): identificada pela descrição "Fechamento #N". O número
 * precisa casar inteiro — a busca antiga por "Fechamento #1" também pegava o #12.
 */
export function ehReceitaReposicaoLegada(transacao, numero) {
  if (numero === null || numero === undefined || numero === "") return false;
  if (String(transacao?.tipo || "").toLowerCase() !== "receita") return false;
  const descricao = String(transacao?.descricao || "");
  const alvo = `Fechamento #${numero}`;
  for (let i = descricao.indexOf(alvo); i !== -1; i = descricao.indexOf(alvo, i + 1)) {
    const seguinte = descricao.charAt(i + alvo.length);
    if (!/[0-9]/.test(seguinte)) return true;
  }
  return false;
}
