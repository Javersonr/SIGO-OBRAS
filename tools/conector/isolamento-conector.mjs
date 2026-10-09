// Isolamento entre empresas do conector do Claude (Plano 2; spec 2026-09-25 §9).
// Fala com PRODUÇÃO: quem roda é o Javerson, no PRÓPRIO terminal (não cole as chaves no chat).
//
// Precisa de DUAS EMPRESAS DE TESTE, cada uma com um usuário Admin e o conector liberado, e de uma
// chave manual de cada (Meu Perfil → Claude (IA) → Gerar chave do Claude Code):
//   SIGO_CHAVE_A=sigo_pk_... SIGO_CHAVE_B=sigo_pk_... \
//   SIGO_OP_A=<uuid de uma oportunidade da A> SIGO_ATESTADO_A=<uuid de um atestado da A> \
//   node tools/conector/isolamento-conector.mjs
// Opcionais (a checagem é pulada sem eles):
//   SIGO_ANON              anon key pública do SIGO (REST, Storage e GraphQL)
//   SIGO_TOKEN_SPA         access token de uma sessão da SPA (o mcp tem de recusar)
//   SIGO_OP_B              oportunidade da B (link de envio da B usado com a chave A)
//   SIGO_ARQUIVO_OUTRA_OP  arquivo de OUTRA oportunidade da A (ler_edital_anexado com a op A)
//
// O que grava: dois links de envio de teste (um na A e, com SIGO_OP_B, um na B), que vencem em 2 h.
// Nada mais: as chamadas cruzadas são recusadas antes de gravar.
// Saída: uma linha OK/FALHA/PULEI por checagem; código de saída 1 se houver FALHA.
const SUPABASE = "https://fpyvdwpvxrubrkdwrqbs.supabase.co";
const MCP = `${SUPABASE}/functions/v1/mcp`;
const FUNCOES = `${SUPABASE}/functions/v1`;
const NENHUM = "00000000-0000-4000-8000-000000000000";

const env = process.env;
const faltando = ["SIGO_CHAVE_A", "SIGO_CHAVE_B", "SIGO_OP_A", "SIGO_ATESTADO_A"].filter(
  (k) => !env[k]
);
if (faltando.length) {
  console.log(`Defina ${faltando.join(", ")} (veja o cabeçalho deste arquivo).`);
  process.exit(2);
}
const { SIGO_CHAVE_A: A, SIGO_CHAVE_B: B, SIGO_OP_A: OP_A, SIGO_ATESTADO_A: AT_A } = env;

let falhas = 0;
let puladas = 0;
const conferir = (nome, cond, detalhe = "") => {
  console.log(`${cond ? "OK   " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas++;
};
const pular = (nome, motivo) => {
  console.log(`PULEI ${nome} ${motivo}`);
  puladas++;
};
const json = (r) => r.json().catch(() => null);

let id = 0;
/** tools/call na era legada (2025-11-25) → { status, sc: structuredContent, isError } */
async function ferramenta(chave, nome, args) {
  const r = await fetch(MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++id,
      method: "tools/call",
      params: { name: nome, arguments: args },
    }),
  });
  const corpo = await json(r);
  return {
    status: r.status,
    sc: corpo?.result?.structuredContent ?? null,
    isError: corpo?.result?.isError === true,
  };
}

const motivo = (r) => r.sc?.motivo ?? `HTTP ${r.status}`;
async function deveSerNaoEncontrado(nome, chave, ferramentaNome, args) {
  const r = await ferramenta(chave, ferramentaNome, args);
  conferir(nome, r.isError && r.sc?.motivo === "nao_encontrado", motivo(r));
}

async function recusada(nome, url, init) {
  const r = await fetch(url, init);
  conferir(nome, r.status === 401 || r.status === 403, `status ${r.status}`);
}

async function linkDeEnvio(chave, oportunidadeId) {
  const r = await ferramenta(chave, "gerar_link_envio", {
    alvo: "oportunidade",
    oportunidade_id: oportunidadeId,
    arquivos: [{ nome: "isolamento.pdf", categoria: null, pasta: null }],
  });
  return r.isError ? null : r.sc?.link_id;
}

async function isolamento() {
  // 0. as duas chaves funcionam e são de empresas diferentes
  const [ea, eb] = [
    await ferramenta(A, "empresa_atual", {}),
    await ferramenta(B, "empresa_atual", {}),
  ];
  conferir("chave A responde empresa_atual", !!ea.sc?.empresa?.id, motivo(ea));
  conferir("chave B responde empresa_atual", !!eb.sc?.empresa?.id, motivo(eb));
  conferir(
    "as chaves A e B são de empresas diferentes",
    !!ea.sc?.empresa?.id && ea.sc.empresa.id !== eb.sc?.empresa?.id
  );
  console.log(`      A: ${ea.sc?.empresa?.nome} | B: ${eb.sc?.empresa?.nome}`);

  // 1. com a chave B, todo id da A é "não encontrado"
  const arquivoA = env.SIGO_ARQUIVO_OUTRA_OP ?? NENHUM;
  await deveSerNaoEncontrado("B: obter_oportunidade(op A)", B, "obter_oportunidade", {
    oportunidade_id: OP_A,
  });
  await deveSerNaoEncontrado("B: ler_edital_anexado(op A)", B, "ler_edital_anexado", {
    oportunidade_id: OP_A,
    arquivo_id: arquivoA,
  });
  await deveSerNaoEncontrado("B: registrar_atende(op A)", B, "registrar_atende", {
    oportunidade_id: OP_A,
    itens: [
      { exigencia_id: "op1", status: "atende", atestado_ids: [], justificativa: "isolamento" },
    ],
  });
  await deveSerNaoEncontrado("B: adicionar_nota(op A)", B, "adicionar_nota", {
    oportunidade_id: OP_A,
    texto: "teste de isolamento",
  });
  await deveSerNaoEncontrado("B: importar_orcamento(op A)", B, "importar_orcamento", {
    oportunidade_id: OP_A,
    linhas: [
      { item: "1", descricao: "ETAPA DE TESTE" },
      {
        item: "1.1",
        codigo: "1",
        fonte: "PRÓPRIA",
        descricao: "Item de teste",
        unidade: "un",
        quantidade: 1,
        preco_unitario: 10,
        total: 10,
      },
    ],
  });
  await deveSerNaoEncontrado("B: aplicar_desconto(op A)", B, "aplicar_desconto", {
    oportunidade_id: OP_A,
    desconto_pct: 10,
  });
  await deveSerNaoEncontrado("B: importar_cronograma(op A)", B, "importar_cronograma", {
    oportunidade_id: OP_A,
    meses: 1,
    linhas: [{ item: "1", pct: [100] }],
  });
  await deveSerNaoEncontrado("B: registrar_proposta(op A)", B, "registrar_proposta", {
    oportunidade_id: OP_A,
  });
  await deveSerNaoEncontrado("B: ler_orcamento(op A)", B, "ler_orcamento", {
    oportunidade_id: OP_A,
  });
  await deveSerNaoEncontrado("B: gerar_link_envio(atestado A)", B, "gerar_link_envio", {
    alvo: "atestado",
    atestado_id: AT_A,
    arquivos: [{ nome: "cat.pdf" }],
  });

  // 2. link de envio da A: a B não vê nem registra
  const linkA = await linkDeEnvio(A, OP_A);
  conferir("A: gerar_link_envio(op A) funciona", !!linkA);
  if (linkA) {
    await deveSerNaoEncontrado("B: status_envio(link da A)", B, "status_envio", { link_id: linkA });
    await deveSerNaoEncontrado("B: registrar_arquivos(link da A)", B, "registrar_arquivos", {
      link_id: linkA,
    });
  }

  // 3. ref forjada
  if (env.SIGO_OP_B) {
    const linkB = await linkDeEnvio(B, env.SIGO_OP_B);
    if (linkB) {
      await deveSerNaoEncontrado("A: registrar_arquivos(link da B)", A, "registrar_arquivos", {
        link_id: linkB,
      });
    } else {
      conferir("B: gerar_link_envio(op B) funciona", false);
    }
  } else {
    pular("A: registrar_arquivos(link da B)", "(defina SIGO_OP_B)");
  }
  if (env.SIGO_ARQUIVO_OUTRA_OP) {
    await deveSerNaoEncontrado(
      "A: ler_edital_anexado(op A, arquivo de outra oportunidade)",
      A,
      "ler_edital_anexado",
      { oportunidade_id: OP_A, arquivo_id: env.SIGO_ARQUIVO_OUTRA_OP }
    );
  } else {
    pular(
      "A: ler_edital_anexado com arquivo de outra oportunidade",
      "(defina SIGO_ARQUIVO_OUTRA_OP)"
    );
  }

  // 4. campo fora da lista
  const extra = await ferramenta(A, "criar_ou_atualizar_oportunidade", {
    edital: { orgao: "Prefeitura de Teste", campo_inventado: "x" },
    empresa_id: NENHUM,
  });
  conferir(
    "A: campo extra em criar_ou_atualizar_oportunidade → campos_fora_da_lista",
    extra.isError && extra.sc?.motivo === "campos_fora_da_lista",
    motivo(extra)
  );

  // 5. a chave A não vale fora do conector
  const comChave = { authorization: `Bearer ${A}`, "content-type": "application/json" };
  if (env.SIGO_ANON) {
    const h = { apikey: env.SIGO_ANON, authorization: `Bearer ${A}` };
    await recusada(
      "chave A recusada em /rest/v1/oportunidade",
      `${SUPABASE}/rest/v1/oportunidade?select=id&limit=1`,
      {
        headers: h,
      }
    );
    await recusada(
      "chave A recusada no Storage (anexos-oportunidade)",
      `${SUPABASE}/storage/v1/object/list/anexos-oportunidade`,
      {
        method: "POST",
        headers: { ...h, "content-type": "application/json" },
        body: JSON.stringify({ prefix: "" }),
      }
    );
    await recusada("chave A recusada em /graphql/v1", `${SUPABASE}/graphql/v1`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
  } else {
    pular("chave A em REST, Storage e GraphQL", "(defina SIGO_ANON)");
  }
  for (const [funcao, corpo] of [
    ["trocar-empresa", { empresa_id: NENHUM }],
    ["alterar-senha", { senha_atual: "x", nova_senha: "y" }],
    ["ia-processar", { action: "edital_atende" }],
    ["recibo-fornecedor", { acao: "pdf_quitado", transacao_id: NENHUM }],
  ]) {
    await recusada(`chave A recusada em ${funcao}`, `${FUNCOES}/${funcao}`, {
      method: "POST",
      headers: comChave,
      body: JSON.stringify(corpo),
    });
  }

  // 6. token da SPA não vale no mcp
  if (env.SIGO_TOKEN_SPA) {
    const r = await fetch(MCP, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${env.SIGO_TOKEN_SPA}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/list", params: {} }),
    });
    conferir("token da SPA no mcp → 401", r.status === 401, `status ${r.status}`);
  } else {
    pular("token da SPA no mcp", "(defina SIGO_TOKEN_SPA)");
  }
}

const ehErroDeRede = (e) => e instanceof TypeError && /fetch failed/i.test(e?.message ?? "");

try {
  await isolamento();
} catch (e) {
  if (!ehErroDeRede(e)) throw e;
  const causa = e?.cause?.message ?? e?.cause?.code;
  console.log(`FALHA de rede: ${e.message}${causa ? ` (${causa})` : ""}`);
  process.exit(1);
}

if (falhas) console.log(`\n${falhas} FALHA(S)`);
else if (puladas) console.log(`\nConcluído com ${puladas} checagens puladas`);
else console.log("\nTudo certo.");
process.exit(falhas ? 1 : 0);
