// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/declaracao-ambiente.test.ts
//
// T35 (declaração de ambiente e horário; NR-1, Anexo II, 4.3 e 4.4). A regra pura (`declaracao-ambiente.ts`), a
// leitura do banco com o cliente injetado, a ligação dela no `index.ts` (que não é importável no Node: confere-se
// pelo TEXTO do código, como em `endurecimento.test.ts`) e o espelho do front. Só dados e números fictícios: o
// repositório é público.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  ART_MAX,
  EVENTO_DECLARACAO_AMBIENTE,
  ITENS_DA_DECLARACAO,
  MSG_DECLARACAO_INCOMPLETA,
  MSG_TEXTO_MUDOU,
  TEXTO_MAX,
  TEXTO_MIN,
  TEXTO_PADRAO_DA_DECLARACAO,
  declaracaoParaOAluno,
  declaracaoVigente,
  detalheDaDeclaracao,
  lerDeclaracoesDoDia,
  lerTextoDaDeclaracao,
  matriculasDeclaradasNoDia,
  validarDeclaracao,
} from "./declaracao-ambiente.ts";
import * as espelho from "../../../apps/web/src/lib/ead-declaracao-ambiente.js";

const PADRAO = declaracaoVigente([]);
const completa = { local_adequado: true, horario_reservado: true, sem_outra_atividade: true };

// ------------------------------------------------------------------ o texto em vigor
test("sem versão salva vale o texto padrão: versão 0, pendente de aprovação do RT, sem ART", () => {
  for (const vazio of [[], null, undefined]) {
    const v = declaracaoVigente(vazio as never);
    assert.deepEqual(v, {
      versao: 0,
      texto: TEXTO_PADRAO_DA_DECLARACAO,
      art: null,
      aprovado: false,
    });
  }
  // o padrão é um texto de verdade: neutro, dentro do limite e sem dado pessoal
  assert.ok(TEXTO_PADRAO_DA_DECLARACAO.length >= TEXTO_MIN);
  assert.ok(TEXTO_PADRAO_DA_DECLARACAO.length <= TEXTO_MAX);
  assert.ok(!/@|\d{3}\.\d{3}\.\d{3}/.test(TEXTO_PADRAO_DA_DECLARACAO));
});

test("com versões salvas vale a de maior número, aprovada pelo RT, com a ART aparada", () => {
  const v = declaracaoVigente([
    { versao: 1, texto: "Texto da versão um, com mais de vinte caracteres.", art: null },
    {
      versao: 3,
      texto: "  Texto da versão três, com mais de vinte caracteres.  ",
      art: "  ART 123  ",
    },
    { versao: 2, texto: "Texto da versão dois, com mais de vinte caracteres.", art: "ART 99" },
  ]);
  assert.deepEqual(v, {
    versao: 3,
    texto: "Texto da versão três, com mais de vinte caracteres.",
    art: "ART 123",
    aprovado: true,
  });
});

test("linha estragada (versão inválida, texto vazio ou curto demais) é ignorada, nunca vira o texto vigente", () => {
  const boa = { versao: 2, texto: "Texto bom, com mais de vinte caracteres.", art: "" };
  for (const ruim of [
    { versao: 0, texto: "Texto com mais de vinte caracteres." },
    { versao: -1, texto: "Texto com mais de vinte caracteres." },
    { versao: 1.5, texto: "Texto com mais de vinte caracteres." },
    { versao: "9", texto: "Texto com mais de vinte caracteres." },
    { versao: 9, texto: "" },
    { versao: 9, texto: "   " },
    { versao: 9, texto: "curto" },
    { versao: 9, texto: 123 },
    { versao: 9 },
    null,
    undefined,
  ]) {
    const v = declaracaoVigente([ruim as never, boa]);
    assert.equal(v.versao, 2, JSON.stringify(ruim));
    assert.equal(v.art, null, "ART vazia vira null");
  }
  // só linhas ruins: cai no texto padrão (e não afirma que o RT aprovou)
  assert.equal(declaracaoVigente([{ versao: 7, texto: "" } as never]).aprovado, false);
});

test("o aluno recebe versão, texto, ART e os itens; nada de quem salvou nem se foi aprovada", () => {
  const aluno = declaracaoParaOAluno({
    versao: 4,
    texto: "Texto do RT, com mais de vinte caracteres.",
    art: "ART 55",
    aprovado: true,
  });
  assert.deepEqual(Object.keys(aluno).sort(), ["art", "itens", "texto", "versao"]);
  assert.equal(aluno.versao, 4);
  assert.equal(aluno.art, "ART 55");
  assert.deepEqual(
    aluno.itens.map((i) => i.id),
    ["local_adequado", "horario_reservado", "sem_outra_atividade"]
  );
  // a versão 0 (padrão) também vai: o aluno só precisa do número para confirmar o que leu
  assert.equal(declaracaoParaOAluno(PADRAO).versao, 0);
});

// ------------------------------------------------------------------ a declaração do aluno
test("a declaração só vale com os TRÊS itens confirmados (true de verdade) e a versão que o aluno leu", () => {
  const vigente = { ...PADRAO, versao: 2, aprovado: true };
  assert.deepEqual(validarDeclaracao({ versao: 2, ...completa }, vigente), { ok: true });
  for (const item of ITENS_DA_DECLARACAO.map((i) => i.id)) {
    for (const valor of [false, undefined, null, "true", 1, "sim"]) {
      const r = validarDeclaracao({ versao: 2, ...completa, [item]: valor }, vigente);
      assert.deepEqual(
        r,
        {
          ok: false,
          status: 400,
          codigo: "DECLARACAO_INCOMPLETA",
          mensagem: MSG_DECLARACAO_INCOMPLETA,
        },
        `${item}=${String(valor)}`
      );
    }
  }
});

test("o texto mudou desde que o aluno o leu: 409 TEXTO_MUDOU, antes de olhar os itens", () => {
  const vigente = { ...PADRAO, versao: 3, aprovado: true };
  for (const lida of [2, 4, 0, undefined, null, "3", 3.5]) {
    const r = validarDeclaracao({ versao: lida as never, ...completa }, vigente);
    assert.deepEqual(r, {
      ok: false,
      status: 409,
      codigo: "TEXTO_MUDOU",
      mensagem: MSG_TEXTO_MUDOU,
    });
  }
  // texto mudado E itens faltando: o aluno precisa reler primeiro
  assert.equal(validarDeclaracao({ versao: 1 }, vigente).ok, false);
  assert.equal((validarDeclaracao({ versao: 1 }, vigente) as { status: number }).status, 409);
  // o texto padrão (versão 0) também se confirma pelo número
  assert.deepEqual(validarDeclaracao({ versao: 0, ...completa }, PADRAO), { ok: true });
  assert.equal(validarDeclaracao(null as never, PADRAO).ok, false);
});

test("o detalhe do evento leva o texto inteiro, a versão, a ART, o dia e os três itens", () => {
  const vigente = {
    versao: 2,
    texto: "Texto do RT, com mais de vinte caracteres.",
    art: "ART 55",
    aprovado: true,
  };
  assert.deepEqual(detalheDaDeclaracao({ vigente, dia: "2026-10-07" }), {
    dia: "2026-10-07",
    versao: 2,
    texto_padrao: false,
    art: "ART 55",
    texto: "Texto do RT, com mais de vinte caracteres.",
    local_adequado: true,
    horario_reservado: true,
    sem_outra_atividade: true,
  });
  const padrao = detalheDaDeclaracao({ vigente: PADRAO, dia: "2026-10-07" });
  assert.equal(padrao.versao, 0);
  assert.equal(
    padrao.texto_padrao,
    true,
    "sem aprovação do RT o evento diz que o texto é o padrão"
  );
  assert.equal(padrao.art, null);
  assert.equal(padrao.texto, TEXTO_PADRAO_DA_DECLARACAO);
});

test("o nome do evento é o que a trilha do RH conhece", () => {
  assert.equal(EVENTO_DECLARACAO_AMBIENTE, "declaracao_ambiente");
});

// ------------------------------------------------------------------ "hoje" é o dia de Brasília
test("matrículas já declaradas hoje: pelo dia de Brasília do carimbo do servidor", () => {
  const eventos = [
    // 00:00 em Brasília de 07/10 (03:00 UTC): já é hoje
    { evento: "declaracao_ambiente", matricula_id: "m1", created_at: "2026-10-07T03:00:00Z" },
    // 23:59 em Brasília de 06/10 (02:59 UTC de 07/10): ainda é ontem
    { evento: "declaracao_ambiente", matricula_id: "m2", created_at: "2026-10-07T02:59:59Z" },
    // 22:00 em Brasília de 07/10 (01:00 UTC de 08/10): ainda é hoje
    { evento: "declaracao_ambiente", matricula_id: "m3", created_at: "2026-10-08T01:00:00Z" },
    // outro evento, sem matrícula, data ilegível: não contam
    { evento: "login", matricula_id: "m4", created_at: "2026-10-07T12:00:00Z" },
    { evento: "declaracao_ambiente", matricula_id: null, created_at: "2026-10-07T12:00:00Z" },
    { evento: "declaracao_ambiente", matricula_id: "m5", created_at: "ontem" },
    null,
  ];
  assert.deepEqual([...matriculasDeclaradasNoDia(eventos as never, "2026-10-07")].sort(), [
    "m1",
    "m3",
  ]);
  assert.deepEqual([...matriculasDeclaradasNoDia(null as never, "2026-10-07")], []);
});

// ------------------------------------------------------------------ leitura no banco (cliente injetado)
interface Passo {
  tabela: string;
  passos: unknown[][];
}
/** Cliente falso: cada `.from()` devolve uma cadeia que registra os passos e resolve com `resultado`. */
function bancoFalso(resultado: { data?: unknown; error?: unknown }) {
  const chamadas: Passo[] = [];
  return {
    chamadas,
    from(tabela: string) {
      const registro: Passo = { tabela, passos: [] };
      chamadas.push(registro);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "gte", "order", "limit", "is"]) {
        q[m] = (...args: unknown[]) => {
          registro.passos.push([m, ...args]);
          return q;
        };
      }
      q.then = (ok: (v: unknown) => unknown, ruim: (e: unknown) => unknown) =>
        Promise.resolve(resultado).then(ok, ruim);
      return q;
    },
  };
}

test("lerTextoDaDeclaracao: a versão mais nova SÓ da empresa da sessão; sem linha, o padrão", async () => {
  const db = bancoFalso({
    data: [{ versao: 5, texto: "Texto vigente, com mais de vinte caracteres.", art: "ART 1" }],
    error: null,
  });
  const r = await lerTextoDaDeclaracao(db, "empresa-1");
  assert.deepEqual(r, {
    ok: true,
    vigente: {
      versao: 5,
      texto: "Texto vigente, com mais de vinte caracteres.",
      art: "ART 1",
      aprovado: true,
    },
  });
  const [chamada] = db.chamadas;
  assert.equal(chamada.tabela, "treinamento_declaracao_texto");
  assert.ok(
    chamada.passos.some((p) => p[0] === "eq" && p[1] === "empresa_id" && p[2] === "empresa-1")
  );
  assert.ok(chamada.passos.some((p) => p[0] === "order" && p[1] === "versao"));
  assert.ok(chamada.passos.some((p) => p[0] === "limit"));

  const vazio = await lerTextoDaDeclaracao(bancoFalso({ data: [], error: null }), "empresa-1");
  assert.deepEqual(vazio, { ok: true, vigente: PADRAO });
});

test("lerTextoDaDeclaracao: erro do banco NÃO vira o texto padrão (falha fechado, com rastro no log)", async () => {
  const antes = console.error;
  const logs: string[] = [];
  console.error = (...a: unknown[]) => logs.push(a.join(" "));
  try {
    const r = await lerTextoDaDeclaracao(
      bancoFalso({ data: null, error: { code: "42P01", message: "tabela ausente" } }),
      "empresa-1"
    );
    assert.deepEqual(r, { ok: false });
  } finally {
    console.error = antes;
  }
  assert.ok(logs.some((l) => l.includes("declaração de ambiente") && l.includes("42P01")));
});

test("lerDeclaracoesDoDia: eventos do funcionário e da empresa da sessão, nas matrículas dele, nas últimas 36 h", async () => {
  const agora = new Date("2026-10-07T15:00:00Z");
  const db = bancoFalso({
    data: [
      { matricula_id: "m1", created_at: "2026-10-07T12:00:00Z" },
      { matricula_id: "m2", created_at: "2026-10-06T12:00:00Z" },
    ],
    error: null,
  });
  const r = await lerDeclaracoesDoDia(db, {
    funcionarioId: "func-1",
    empresaId: "empresa-1",
    matriculaIds: ["m1", "m2"],
    agora,
    hoje: "2026-10-07",
  });
  assert.equal(r.ok, true);
  assert.deepEqual([...(r as { declaradas: Set<string> }).declaradas], ["m1"]);
  const { tabela, passos } = db.chamadas[0];
  assert.equal(tabela, "treinamento_evento");
  const tem = (...p: unknown[]) =>
    passos.some((x) => x.length === p.length && x.every((v, i) => v === p[i]));
  assert.ok(tem("eq", "empresa_id", "empresa-1"));
  assert.ok(tem("eq", "funcionario_id", "func-1"));
  assert.ok(tem("eq", "evento", "declaracao_ambiente"));
  assert.ok(passos.some((p) => p[0] === "in" && p[1] === "matricula_id"));
  const desde = passos.find((p) => p[0] === "gte" && p[1] === "created_at");
  assert.equal(desde?.[2], new Date(agora.getTime() - 36 * 3600_000).toISOString());
});

test("lerDeclaracoesDoDia: sem matrículas não consulta; erro do banco devolve ok:false", async () => {
  const db = bancoFalso({ data: [], error: null });
  const r = await lerDeclaracoesDoDia(db, {
    funcionarioId: "f",
    empresaId: "e",
    matriculaIds: [],
    agora: new Date(),
    hoje: "2026-10-07",
  });
  assert.deepEqual(r, { ok: true, declaradas: new Set() });
  assert.equal(db.chamadas.length, 0);

  const antes = console.error;
  console.error = () => {};
  try {
    const falha = await lerDeclaracoesDoDia(bancoFalso({ data: null, error: { message: "x" } }), {
      funcionarioId: "f",
      empresaId: "e",
      matriculaIds: ["m1"],
      agora: new Date(),
      hoje: "2026-10-07",
    });
    assert.deepEqual(falha, { ok: false });
  } finally {
    console.error = antes;
  }
});

// ------------------------------------------------------------------ o espelho do front
test("o front e o servidor falam do mesmo texto padrão, dos mesmos itens e dos mesmos limites", () => {
  assert.equal(espelho.TEXTO_PADRAO_DA_DECLARACAO, TEXTO_PADRAO_DA_DECLARACAO);
  assert.deepEqual(espelho.ITENS_DA_DECLARACAO, ITENS_DA_DECLARACAO);
  assert.equal(espelho.TEXTO_MIN, TEXTO_MIN);
  assert.equal(espelho.TEXTO_MAX, TEXTO_MAX);
  assert.equal(espelho.ART_MAX, ART_MAX);
  assert.equal(espelho.EVENTO_DECLARACAO_AMBIENTE, EVENTO_DECLARACAO_AMBIENTE);
  // a escolha da versão vigente é a mesma nos dois lados, nos mesmos casos
  const casos = [
    [],
    [{ versao: 1, texto: "Texto um, com mais de vinte caracteres.", art: " ART " }],
    [
      { versao: 1, texto: "Texto um, com mais de vinte caracteres." },
      { versao: 2, texto: "curto" },
    ],
    [{ versao: "3", texto: "Texto com mais de vinte caracteres." }],
  ];
  for (const linhas of casos) {
    assert.deepEqual(espelho.declaracaoVigente(linhas), declaracaoVigente(linhas as never));
  }
});

// ------------------------------------------------------------------ a ligação no index.ts
const indexTs = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const semComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const codigo = semComentarios(indexTs);

function trechoDaAcao(nome: string): string {
  const inicio = codigo.indexOf(`if (body.acao === "${nome}")`);
  assert.ok(inicio >= 0, `ação ${nome} não encontrada no index.ts`);
  const resto = codigo.slice(inicio + 10);
  const proximo = resto.search(/\n {4}(?:if \(body\.acao === |\/\/ -{5,})/);
  return codigo.slice(inicio, proximo >= 0 ? inicio + 10 + proximo : undefined);
}

test("declarar_ambiente é ação do aluno com sessão: depois da troca da senha provisória", () => {
  const acao = codigo.indexOf(`body.acao === "declarar_ambiente"`);
  assert.ok(acao >= 0);
  assert.ok(acao > codigo.indexOf("if (acesso.senha_provisoria)"), "antes da senha pessoal");
  assert.ok(acao > codigo.indexOf(`const minhaMatricula = async`), "usa a matrícula do aluno");
});

test("declarar_ambiente: matrícula do próprio aluno, texto e itens conferidos, evento de SERVIDOR com o texto", () => {
  const t = trechoDaAcao("declarar_ambiente");
  // a matrícula é a do aluno da sessão (nenhum id do corpo vale sem passar por ela)
  assert.ok(t.includes("minhaMatricula(body.matricula_id)"));
  assert.ok(/if \(!mat\) return fail\("Matrícula não encontrada", 404\)/.test(t));
  // o texto vigente vem do banco, só da empresa da sessão; falha de leitura = 503, nunca o texto padrão
  assert.ok(t.includes("lerTextoDaDeclaracao(supabase, empresaId)"));
  assert.ok(/!texto\.ok[\s\S]{0,120}503/.test(t));
  // a conferência da versão e dos itens é a regra testada acima
  assert.ok(t.includes("validarDeclaracao(body, texto.vigente)"));
  // o evento é gravado pelo servidor (sem `origem: "navegador"`), com o detalhe da regra, e a resposta só
  // diz que deu certo se a linha ficou na trilha
  assert.ok(/ev\(\{[\s\S]*evento:\s*EVENTO_DECLARACAO_AMBIENTE/.test(t));
  assert.ok(t.includes("detalheDaDeclaracao("));
  assert.equal(/origem:\s*"navegador"/.test(t), false, "a declaração é evento de servidor");
  assert.ok(/gravado[\s\S]{0,200}503|!gravado/.test(t), "evento não gravado = erro, não sucesso");
  // uma declaração por matrícula e dia: a segunda no mesmo dia não grava outro evento
  assert.ok(t.includes("lerDeclaracoesDoDia("));
  assert.ok(/ja_declarada/.test(t));
});

test("o aluno NÃO consegue gravar a declaração pela ação evento (só o servidor grava)", () => {
  const lista = codigo.slice(
    codigo.indexOf("const EVENTOS_CLIENTE = new Set(["),
    codigo.indexOf("]);", codigo.indexOf("const EVENTOS_CLIENTE"))
  );
  assert.ok(lista.length > 50, "a lista de eventos do navegador não foi lida");
  assert.equal(lista.includes("declaracao_ambiente"), false);
  assert.equal(lista.includes(EVENTO_DECLARACAO_AMBIENTE), false);
});

test("dados leva o texto da declaração e, em cada curso, se o aluno já declarou hoje", () => {
  const t = trechoDaAcao("dados");
  assert.ok(t.includes("lerTextoDaDeclaracao(supabase, empresaId)"));
  assert.ok(t.includes("lerDeclaracoesDoDia(supabase,"));
  assert.ok(t.includes("declaracao_ambiente:"));
  assert.ok(t.includes("declaracao_hoje"));
  // o `dados` não derruba o portal se a leitura falhar: sem o texto, o curso abre sem a tela da declaração
  assert.ok(/declaracaoParaOAluno\(/.test(t));
});

test("o servidor só LÊ a tabela dos textos (as versões nascem pela tela do RH e o banco as trava)", () => {
  const raiz = fileURLToPath(new URL("../", import.meta.url));
  const achados: string[] = [];
  const varrer = (pasta: string) => {
    for (const e of readdirSync(pasta, { withFileTypes: true })) {
      const caminho = join(pasta, e.name);
      if (e.isDirectory()) varrer(caminho);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
        const texto = semComentarios(readFileSync(caminho, "utf8"));
        for (const m of texto.matchAll(
          /from\(\s*["']treinamento_declaracao_texto["']\s*\)([\s\S]{0,400})/g
        )) {
          if (/\.(insert|update|upsert|delete)\(/.test(m[1])) achados.push(caminho);
        }
      }
    }
  };
  varrer(raiz);
  assert.deepEqual(achados, []);
});
