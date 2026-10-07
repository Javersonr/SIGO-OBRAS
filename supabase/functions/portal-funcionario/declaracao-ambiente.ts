// Declaração de ambiente e horário (T35; NR-1, Anexo II, 4.3 "ambiente que favoreça a concentração" e 4.4
// "período exclusivo, sem trabalho simultâneo"). Regra pura, sem `Deno.*` nem rede: o `index.ts` liga o banco.
// Teste em declaracao-ambiente.test.ts. O espelho do front é apps/web/src/lib/ead-declaracao-ambiente.js.
//
// Como funciona: na 1ª abertura de um curso em cada dia (dia de Brasília), o portal mostra ao aluno a orientação do
// responsável técnico (RT) e três itens a confirmar. A confirmação é a ação `declarar_ambiente`: o SERVIDOR grava
// o evento `declaracao_ambiente` na trilha (origem "servidor", com a hora, o IP e o aparelho de quem pediu) com o
// TEXTO INTEIRO, a versão e a ART que o aluno viu, e os três itens. O navegador nunca grava essa declaração (o
// evento não está na lista do navegador). O RH lê a janela de atividade de cada aluno por dia na tela do RH.
//
// O texto é do RT (decisão do Javerson de 06/10/2026): cada salvamento é uma VERSÃO nova na tabela
// `treinamento_declaracao_texto` (migração 0144; só inclusão), com a ART (número ou referência) do RT. Enquanto o RT
// não salvar nenhuma, vale o texto padrão abaixo (versão 0), que o RH vê marcado como "pendente de aprovação do RT"
// e que o evento registra como `texto_padrao: true`.
import { dataBrasilia } from "../_shared/portal-funcionario.ts";

/** Nome do evento na trilha (`treinamento_evento.evento`); só o servidor o grava. */
export const EVENTO_DECLARACAO_AMBIENTE = "declaracao_ambiente";

/** Limites do texto e da ART (os mesmos do check da migração 0144 e da tela do RT). */
export const TEXTO_MIN = 20;
export const TEXTO_MAX = 4000;
export const ART_MAX = 120;

/** Os três itens que o aluno confirma (4.3 local, 4.4 horário e exclusividade). Os `id` são os do evento. */
export const ITENS_DA_DECLARACAO = [
  {
    id: "local_adequado",
    rotulo: "Estou em um local adequado, que favorece a minha concentração.",
  },
  {
    id: "horario_reservado",
    rotulo: "Reservei este horário para o treinamento.",
  },
  {
    id: "sem_outra_atividade",
    rotulo: "Não vou fazer trabalho nem outra atividade enquanto estudo.",
  },
] as const;

/**
 * Texto padrão: neutro, só uma sugestão. Vale até o RT salvar o dele (versão 1), e o RH o vê como "pendente de
 * aprovação do RT". Mudar este texto muda a sugestão e o texto que o aluno vê SEM versão salva; o que cada aluno
 * leu fica no evento dele (o texto inteiro), então o que já foi declarado não muda.
 */
export const TEXTO_PADRAO_DA_DECLARACAO = [
  "Antes de começar, leia com atenção.",
  "",
  "Para o treinamento valer, faça-o em condições adequadas:",
  "",
  "1. Local: escolha um lugar que favoreça a concentração, com pouco ruído, boa iluminação e sem interrupções.",
  "2. Horário: reserve este período só para o treinamento. Durante as aulas e a prova, não faça trabalho nem outra atividade ao mesmo tempo.",
  "3. Equipamento: use um aparelho com internet estável, tela legível e som funcionando.",
  "",
  "Se não puder cumprir estas condições agora, saia do curso e volte em outro momento. O seu tempo de estudo só conta com a aula aberta e a tela visível.",
  "",
  "Ao confirmar abaixo, você declara que cumpre estas condições hoje, neste acesso.",
].join("\n");

/** O texto em vigor: a versão salva de maior número, ou o padrão (versão 0, não aprovado). */
export interface TextoDaDeclaracao {
  versao: number;
  texto: string;
  art: string | null;
  aprovado: boolean;
}

// Aparar e contar do MESMO jeito que o banco (0144): `btrim(texto, E' \t\r\n\f\x0b')` tira só espaço, tab, CR, LF,
// FF e VT (o `trim()` do JS tira também espaço sem quebra, BOM e outros), e `char_length` conta caracteres (o
// `.length` do JS conta unidades UTF-16: um emoji vale 2). Com regras diferentes, uma linha que o banco aceitou podia
// ser "inválida" aqui e mandar o aluno para o texto padrão (A6, T35). O espelho do front tem a mesma regra.
const ESPACOS_DO_BANCO = /^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$/g;
const aparar = (v: unknown): string =>
  typeof v === "string" ? v.replace(ESPACOS_DO_BANCO, "") : "";

/** O tamanho do texto em caracteres, como o `char_length` do banco (não em unidades UTF-16). */
export const tamanhoDoTexto = (v: unknown): number => (typeof v === "string" ? [...v].length : 0);

/**
 * O texto em vigor entre as linhas lidas do banco: a de maior `versao` que for válida (inteiro >= 1, texto de
 * `TEXTO_MIN` a `TEXTO_MAX` caracteres). Linha estragada é ignorada: nunca vira o texto que o aluno confirma. Sem
 * nenhuma linha válida vale o padrão (versão 0, `aprovado: false`).
 */
export function declaracaoVigente(linhas: unknown): TextoDaDeclaracao {
  let melhor: TextoDaDeclaracao | null = null;
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    const l = linha as { versao?: unknown; texto?: unknown; art?: unknown } | null;
    const versao = l?.versao;
    const texto = aparar(l?.texto);
    if (typeof versao !== "number" || !Number.isInteger(versao) || versao < 1) continue;
    const tamanho = tamanhoDoTexto(texto);
    if (tamanho < TEXTO_MIN || tamanho > TEXTO_MAX) continue;
    if (!melhor || versao > melhor.versao) {
      melhor = { versao, texto, art: aparar(l?.art) || null, aprovado: true };
    }
  }
  return melhor ?? { versao: 0, texto: TEXTO_PADRAO_DA_DECLARACAO, art: null, aprovado: false };
}

/** O que o aluno recebe em `dados`: a versão, o texto, a ART e os itens. Sem quem salvou nem a aprovação. */
export function declaracaoParaOAluno(v: TextoDaDeclaracao) {
  return {
    versao: v.versao,
    texto: v.texto,
    art: v.art,
    itens: ITENS_DA_DECLARACAO.map((i) => ({ id: i.id, rotulo: i.rotulo })),
  };
}

export const MSG_DECLARACAO_INCOMPLETA = "Confirme os três itens da declaração para abrir o curso.";
export const MSG_TEXTO_MUDOU = "O texto da declaração foi atualizado. Leia de novo e confirme.";

export type ResultadoDaDeclaracao =
  | { ok: true }
  | { ok: false; status: 400 | 409; codigo: string; mensagem: string };

/**
 * Confere o pedido do aluno contra o texto em vigor. 1º, a versão: tem de ser a que ele leu (se o RT salvou outra
 * no meio do caminho, 409 `TEXTO_MUDOU` e o portal mostra o texto novo). 2º, os três itens: cada um tem de ser o
 * booleano `true` (texto "true", 1 ou "sim" não valem).
 */
export function validarDeclaracao(
  corpo: unknown,
  vigente: TextoDaDeclaracao
): ResultadoDaDeclaracao {
  const pedido = (corpo ?? {}) as Record<string, unknown>;
  if (pedido.versao !== vigente.versao) {
    return { ok: false, status: 409, codigo: "TEXTO_MUDOU", mensagem: MSG_TEXTO_MUDOU };
  }
  for (const item of ITENS_DA_DECLARACAO) {
    if (pedido[item.id] !== true) {
      return {
        ok: false,
        status: 400,
        codigo: "DECLARACAO_INCOMPLETA",
        mensagem: MSG_DECLARACAO_INCOMPLETA,
      };
    }
  }
  return { ok: true };
}

/**
 * O `detalhe` do evento: o dia (Brasília), a versão e o texto INTEIRO que o aluno viu, a ART e os três itens. Com o
 * texto no próprio evento a prova não depende de a versão continuar legível noutro lugar. `texto_padrao` diz que o RT
 * ainda não tinha aprovado um texto.
 */
export function detalheDaDeclaracao(p: { vigente: TextoDaDeclaracao; dia: string }) {
  return {
    dia: p.dia,
    versao: p.vigente.versao,
    texto_padrao: !p.vigente.aprovado,
    art: p.vigente.art,
    texto: p.vigente.texto,
    local_adequado: true,
    horario_reservado: true,
    sem_outra_atividade: true,
  };
}

/**
 * As matrículas que já têm declaração no dia `hoje` (Brasília, "AAAA-MM-DD"), pelo carimbo do SERVIDOR do evento
 * (nunca por data informada pelo navegador). Evento de outro nome, sem matrícula ou com data ilegível é ignorado.
 */
export function matriculasDeclaradasNoDia(eventos: unknown, hoje: string): Set<string> {
  const declaradas = new Set<string>();
  for (const e of Array.isArray(eventos) ? eventos : []) {
    const ev = e as { evento?: unknown; matricula_id?: unknown; created_at?: unknown } | null;
    if (!ev || ev.evento !== EVENTO_DECLARACAO_AMBIENTE) continue;
    if (typeof ev.matricula_id !== "string" || !ev.matricula_id) continue;
    const instante = new Date(String(ev.created_at ?? ""));
    if (Number.isNaN(instante.getTime())) continue;
    if (dataBrasilia(instante) === hoje) declaradas.add(ev.matricula_id);
  }
  return declaradas;
}

/** Deixa nos logs a causa de um erro do banco (a resposta ao aluno é genérica). Nada de dado pessoal. */
function registrarErro(etapa: string, erro: unknown) {
  const e = erro as { message?: unknown; code?: unknown } | null;
  console.error(
    "[portal-funcionario] declaração de ambiente:",
    etapa,
    "falhou:",
    e?.code ? `[${String(e.code)}]` : "",
    String(e?.message ?? erro)
  );
}

/**
 * Quantas versões o servidor lê para achar a vigente (as mais novas). Ler só a última mandava o aluno para o texto
 * padrão se ela fosse inválida (gravada fora da tela), com a tela do RT ainda mostrando a anterior; `declaracaoVigente`
 * escolhe a maior versão VÁLIDA entre estas.
 */
export const VERSOES_LIDAS = 20;

/**
 * Lê o texto em vigor da empresa da SESSÃO (service role ignora a RLS: o filtro por empresa é daqui). Sem versão
 * salva vale o padrão. Falha de leitura = `{ ok: false }`: nunca vira o texto padrão, porque o aluno estaria
 * confirmando um texto que o RT pode já ter trocado.
 */
export async function lerTextoDaDeclaracao(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  empresaId: string
): Promise<{ ok: true; vigente: TextoDaDeclaracao } | { ok: false }> {
  const { data, error } = await supabase
    .from("treinamento_declaracao_texto")
    .select("versao, texto, art")
    .eq("empresa_id", empresaId)
    .order("versao", { ascending: false })
    .limit(VERSOES_LIDAS);
  if (error) {
    registrarErro("texto em vigor", error);
    return { ok: false };
  }
  return { ok: true, vigente: declaracaoVigente(data) };
}

/** Até quando para trás o servidor procura a declaração de "hoje" (cobre o dia de Brasília inteiro). */
export const JANELA_DA_DECLARACAO_MS = 36 * 3600_000;

/**
 * As matrículas do aluno que já declararam HOJE. Só os eventos do funcionário e da empresa da sessão, nas
 * matrículas dele, das últimas 36 horas (o dia de Brasília cabe nelas). Sem matrículas não consulta.
 */
export async function lerDeclaracoesDoDia(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  p: {
    funcionarioId: string;
    empresaId: string;
    matriculaIds: string[];
    agora: Date;
    hoje: string;
  }
): Promise<{ ok: true; declaradas: Set<string> } | { ok: false }> {
  const matriculas = [...new Set(p.matriculaIds.filter(Boolean))];
  if (!matriculas.length) return { ok: true, declaradas: new Set() };
  const { data, error } = await supabase
    .from("treinamento_evento")
    .select("matricula_id, created_at")
    .eq("empresa_id", p.empresaId)
    .eq("funcionario_id", p.funcionarioId)
    .eq("evento", EVENTO_DECLARACAO_AMBIENTE)
    .in("matricula_id", matriculas)
    .gte("created_at", new Date(p.agora.getTime() - JANELA_DA_DECLARACAO_MS).toISOString());
  if (error) {
    registrarErro("declarações do dia", error);
    return { ok: false };
  }
  return {
    ok: true,
    declaradas: matriculasDeclaradasNoDia(
      (data ?? []).map((l: { matricula_id: string; created_at: string }) => ({
        ...l,
        evento: EVENTO_DECLARACAO_AMBIENTE,
      })),
      p.hoje
    ),
  };
}
