// node --test supabase/functions/mcp-oauth/envio-tela.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { acaoConcluirEnvio, acaoLinkEnvio, type UsuarioTela } from "./envio-tela.ts";
import { criarFakeAdmin, type ChamadaFake } from "../_shared/conector/testes/fake-admin.ts";

const E = "00000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000010";
const AT = "00000000-0000-4000-8000-000000000020";
const LINK = "00000000-0000-4000-8000-000000000030";
const UC = "00000000-0000-4000-8000-0000000000b1";
const AGORA = new Date("2026-10-08T12:00:00Z");
const C1 = `${E}/2026/10/u1-Edital.pdf`;
const C2 = `${E}/2026/10/u2-Proposta.xlsx`;

const uc: UsuarioTela = {
  id: UC,
  email: "u@exemplo.test",
  nome: "Usuário Teste",
  senhaProvisoria: false,
  senhaAlteradaEm: null,
};

const EDITOR = {
  id: "v1",
  perfil: "Usuario",
  ativo: true,
  permissoes: { Oportunidades: { Lista: { editar: true }, Arquivos: { criar: true } } },
};

const linkBase = (extra: Record<string, unknown> = {}) => ({
  id: LINK,
  empresa_id: E,
  autorizacao_id: "00000000-0000-4000-8000-0000000000a1",
  usuario_custom_id: UC,
  alvo: "oportunidade",
  oportunidade_id: OP,
  atestado_id: null,
  bucket: "anexos-oportunidade",
  arquivos: [
    { indice: 1, nome: "Edital.pdf", tipo: "pdf", categoria: "edital", pasta: null, caminho: C1 },
    {
      indice: 2,
      nome: "Proposta.xlsx",
      tipo: "xlsx",
      categoria: null,
      pasta: "Envelope 01 – Proposta",
      caminho: C2,
    },
  ],
  registrados: [],
  expira_em: "2026-10-08T13:00:00Z",
  usado_em: null,
  usado_por: null,
  ...extra,
});

function montar(
  opcoes: {
    link?: Record<string, unknown> | null;
    vinculo?: Record<string, unknown> | null;
    noStorage?: string[];
  } = {}
) {
  const noStorage = new Set(opcoes.noStorage ?? []);
  return criarFakeAdmin(
    (c: ChamadaFake) => {
      if (c.tabela === "mcp_link_envio" && c.op === "select") {
        return { data: opcoes.link === undefined ? linkBase() : opcoes.link };
      }
      if (c.tabela === "usuario_empresa") {
        return { data: opcoes.vinculo === undefined ? EDITOR : opcoes.vinculo };
      }
      if (c.tabela === "empresa")
        return { data: { id: E, nome: "Empresa Teste", nome_fantasia: null } };
      if (c.tabela === "oportunidade")
        return { data: { id: OP, nome: "PE 012/2026 - Iluminação" } };
      if (c.tabela === "acervo_atestado")
        return { data: { id: AT, numero: "123/2024", objeto: "Obra" } };
      return undefined;
    },
    (c) => {
      if (c.metodo !== "list") return undefined;
      const [pasta, { search }] = c.args as [string, { search: string }];
      return {
        data: noStorage.has(`${pasta}/${search}`) ? [{ name: search, metadata: { size: 9 } }] : [],
      };
    }
  );
}

const corpo = async (r: Response) => ({ status: r.status, json: await r.json() });

test("link_envio: link inexistente → 404; de outro usuário → 403", async () => {
  const sem = montar({ link: null });
  assert.deepEqual(await corpo(await acaoLinkEnvio({ link_id: LINK }, uc, sem.admin, AGORA)), {
    status: 404,
    json: { success: false, error: "Link não encontrado" },
  });
  const invalido = montar();
  assert.equal((await acaoLinkEnvio({ link_id: "x" }, uc, invalido.admin, AGORA)).status, 404);
  assert.equal(invalido.chamadas.length, 0);
  const outro = montar({
    link: linkBase({ usuario_custom_id: "00000000-0000-4000-8000-0000000000b2" }),
  });
  assert.deepEqual(await corpo(await acaoLinkEnvio({ link_id: LINK }, uc, outro.admin, AGORA)), {
    status: 403,
    json: { success: false, error: "Este link foi gerado para outro usuário" },
  });
});

test("link_envio: sem vínculo ativo na empresa do link, ou sem a permissão do alvo → 403", async () => {
  const semVinculo = montar({ vinculo: null });
  const r1 = await corpo(await acaoLinkEnvio({ link_id: LINK }, uc, semVinculo.admin, AGORA));
  assert.equal(r1.status, 403);
  const vinc = semVinculo.chamadas.find((c) => c.tabela === "usuario_empresa")!;
  assert.deepEqual(
    vinc.filtros.filter((f) => f.metodo === "eq").map((f) => f.args),
    [
      ["usuario_email", "u@exemplo.test"],
      ["empresa_id", E],
      ["ativo", true],
    ]
  );
  const soArquivos = montar({
    link: linkBase({
      alvo: "atestado",
      oportunidade_id: null,
      atestado_id: AT,
      bucket: "certificados",
    }),
    vinculo: {
      perfil: "Usuario",
      ativo: true,
      permissoes: { Oportunidades: { Arquivos: { criar: true } } },
    },
  });
  assert.deepEqual(
    await corpo(await acaoLinkEnvio({ link_id: LINK }, uc, soArquivos.admin, AGORA)),
    {
      status: 403,
      json: {
        success: false,
        error: "Seu usuário não tem a permissão Oportunidades → Lista → editar no SIGO.",
        codigo: "sem_permissao",
      },
    }
  );
});

test("link_envio pendente: uma vaga por arquivo; token de upload só para o que falta", async () => {
  const { admin, chamadasStorage } = montar({ noStorage: [C1] });
  const { status, json } = await corpo(await acaoLinkEnvio({ link_id: LINK }, uc, admin, AGORA));
  assert.equal(status, 200);
  assert.deepEqual(
    { ...json, arquivos: undefined },
    {
      success: true,
      link_id: LINK,
      empresa: { id: E, nome: "Empresa Teste" },
      alvo: "oportunidade",
      alvo_nome: "PE 012/2026 - Iluminação",
      situacao: "pendente",
      expira_em: "2026-10-08T13:00:00Z",
      arquivos: undefined,
    }
  );
  assert.equal(json.arquivos[0].enviado, true);
  assert.equal(json.arquivos[0].upload, null);
  assert.deepEqual(json.arquivos[1], {
    indice: 2,
    nome: "Proposta.xlsx",
    tipo: "xlsx",
    categoria: null,
    pasta: "Envelope 01 – Proposta",
    enviado: false,
    upload: { bucket: "anexos-oportunidade", path: C2, token: json.arquivos[1].upload.token },
  });
  assert.deepEqual(
    chamadasStorage.filter((c) => c.metodo === "createSignedUploadUrl").map((c) => c.args[0]),
    [C2]
  );
});

test("link_envio usado: sem token; enviado vem dos registrados", async () => {
  const { admin, chamadasStorage } = montar({
    link: linkBase({
      usado_em: "2026-10-08T11:00:00Z",
      registrados: [{ indice: 1, nome: "Edital.pdf", arquivo_id: "a1", ref: "x", tamanho: 9 }],
    }),
  });
  const { json } = await corpo(await acaoLinkEnvio({ link_id: LINK }, uc, admin, AGORA));
  assert.equal(json.situacao, "usado");
  assert.deepEqual(
    json.arquivos.map((a: { enviado: boolean; upload: unknown }) => [a.enviado, a.upload]),
    [
      [true, null],
      [false, null],
    ]
  );
  assert.equal(chamadasStorage.length, 0);
});

test("concluir_envio: falta arquivo → 409 faltam_arquivos (o link segue pendente)", async () => {
  const { admin, chamadas } = montar();
  const { status, json } = await corpo(
    await acaoConcluirEnvio(
      { link_id: LINK },
      uc,
      admin,
      (async () => new Response(null)) as typeof fetch,
      AGORA
    )
  );
  assert.equal(status, 409);
  assert.equal(json.codigo, "faltam_arquivos");
  assert.equal(json.recusados.length, 2);
  assert.equal(chamadas.filter((c) => c.op === "update").length, 0);
});

test("concluir_envio: de outro usuário → 403 sem tocar no Storage", async () => {
  const { admin, chamadasStorage } = montar({
    link: linkBase({ usuario_custom_id: "00000000-0000-4000-8000-0000000000b2" }),
  });
  const r = await acaoConcluirEnvio({ link_id: LINK }, uc, admin, fetch, AGORA);
  assert.equal(r.status, 403);
  assert.equal(chamadasStorage.length, 0);
});
