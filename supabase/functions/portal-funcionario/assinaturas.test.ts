// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/assinaturas.test.ts
//
// T29: imagem da assinatura do instrutor e do responsável técnico no certificado EAD. A referência
// "bucket/caminho" do curso é congelada em `dados` na emissão (entra no hash); o aluno recebe só URL
// assinada, nunca a referência. Dados sintéticos: nenhum nome, CPF ou empresa reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUCKET_ASSINATURAS,
  certificadoParaOAluno,
  dadosParaOAluno,
  instrutorDoCertificado,
  refDaAssinatura,
  refsDasAssinaturas,
  responsavelTecnicoDoCertificado,
} from "./assinaturas.ts";
import { hashDoCertificado } from "../_shared/portal-funcionario.ts";

const EMPRESA = "empresa-teste";
const OUTRA = "empresa-de-outro";
const REF_INSTRUTOR = `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/aaaa-instrutor.png`;
const REF_RT = `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/bbbb-rt.jpg`;

// ------------------------------------------------------------------ refDaAssinatura
test("refDaAssinatura: aceita só a referência do bucket assinaturas, na pasta da empresa, de imagem", () => {
  assert.equal(BUCKET_ASSINATURAS, "assinaturas");
  assert.equal(refDaAssinatura(REF_INSTRUTOR, EMPRESA), REF_INSTRUTOR);
  assert.equal(refDaAssinatura(REF_RT, EMPRESA), REF_RT);
  // espaços nas pontas não escondem uma ref válida; a ref volta sem eles
  assert.equal(refDaAssinatura(`  ${REF_INSTRUTOR} `, EMPRESA), REF_INSTRUTOR);
  assert.equal(
    refDaAssinatura(`${BUCKET_ASSINATURAS}/${EMPRESA}/x/ASSINATURA.JPEG`, EMPRESA),
    `${BUCKET_ASSINATURAS}/${EMPRESA}/x/ASSINATURA.JPEG`
  );
});

test("refDaAssinatura: referência do Base44 (arquivo perdido) é ignorada, em qualquer forma", () => {
  for (const v of [
    "https://exemplo.base44.app/api/apps/1/files/public/1/assinatura.png",
    "https://media.base44.com/images/public/x/assinatura.png",
    "base44.app/arquivo.png",
    `${BUCKET_ASSINATURAS}/${EMPRESA}/legado/base44.app-assinatura.png`,
  ]) {
    assert.equal(refDaAssinatura(v, EMPRESA), null, v);
  }
});

test("refDaAssinatura: URL (assinada ou não) nunca é uma referência: só o 'bucket/caminho' vale", () => {
  for (const v of [
    `https://armazenamento.exemplo/storage/v1/object/sign/${BUCKET_ASSINATURAS}/${EMPRESA}/a.png?token=x`,
    `https://armazenamento.exemplo/${BUCKET_ASSINATURAS}/${EMPRESA}/a.png`,
    `data:image/png;base64,AAAA`,
    `javascript:alert(1)`,
  ]) {
    assert.equal(refDaAssinatura(v, EMPRESA), null, v);
  }
});

test("refDaAssinatura: outro bucket, pasta de outra empresa, caminho que escapa e não imagem são ignorados", () => {
  for (const v of [
    `treinamentos/${EMPRESA}/2026/10/aaaa.png`, // outro bucket
    `${BUCKET_ASSINATURAS}/${OUTRA}/2026/10/aaaa.png`, // pasta de outra empresa
    `${BUCKET_ASSINATURAS}/${EMPRESA}/../${OUTRA}/aaaa.png`,
    `${BUCKET_ASSINATURAS}/${EMPRESA}/./aaaa.png`,
    `${BUCKET_ASSINATURAS}/${EMPRESA}//aaaa.png`,
    `${BUCKET_ASSINATURAS}\\${EMPRESA}\\aaaa.png`,
    `${BUCKET_ASSINATURAS}/${EMPRESA}`, // sem arquivo
    `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/aaaa.pdf`, // o bucket aceita PDF, o certificado não desenha PDF
    `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/aaaa`, // sem extensão
  ]) {
    assert.equal(refDaAssinatura(v, EMPRESA), null, v);
  }
});

test("refDaAssinatura: vazio, não texto e empresa vazia viram null", () => {
  for (const v of [null, undefined, "", "   ", 42, {}, []]) {
    assert.equal(refDaAssinatura(v, EMPRESA), null);
  }
  assert.equal(refDaAssinatura(REF_INSTRUTOR, ""), null);
});

// ------------------------------------------------------------------ o que é congelado em `dados`
test("instrutorDoCertificado: sem assinatura, o `dados` é o mesmo de antes da T29 (sem chave nova)", () => {
  assert.deepEqual(
    instrutorDoCertificado(
      { instrutor_nome: "Instrutor Teste", instrutor_qualificacao: "Eng." },
      EMPRESA
    ),
    { nome: "Instrutor Teste", qualificacao: "Eng." }
  );
  // campo ausente continua `null` (como o `?? null` que montava o objeto na emissão)
  assert.deepEqual(instrutorDoCertificado({}, EMPRESA), { nome: null, qualificacao: null });
  assert.deepEqual(
    instrutorDoCertificado({ instrutor_assinatura_ref: REF_INSTRUTOR }, EMPRESA),
    { nome: null, qualificacao: null },
    "assinatura sem nome do instrutor não é congelada"
  );
});

test("instrutorDoCertificado: com a referência válida do curso, congela `assinatura_ref`", () => {
  assert.deepEqual(
    instrutorDoCertificado(
      {
        instrutor_nome: "Instrutor Teste",
        instrutor_qualificacao: "Eng.",
        instrutor_assinatura_ref: REF_INSTRUTOR,
      },
      EMPRESA
    ),
    { nome: "Instrutor Teste", qualificacao: "Eng.", assinatura_ref: REF_INSTRUTOR }
  );
});

test("instrutorDoCertificado: referência do Base44, de outra empresa ou de outro bucket é ignorada", () => {
  for (const ref of [
    "https://exemplo.base44.app/assinatura.png",
    `${BUCKET_ASSINATURAS}/${OUTRA}/2026/10/a.png`,
    `treinamentos/${EMPRESA}/2026/10/a.png`,
    `https://armazenamento.exemplo/storage/v1/object/sign/${BUCKET_ASSINATURAS}/${EMPRESA}/a.png?token=x`,
  ]) {
    assert.deepEqual(
      instrutorDoCertificado(
        {
          instrutor_nome: "Instrutor Teste",
          instrutor_qualificacao: "Eng.",
          instrutor_assinatura_ref: ref,
        },
        EMPRESA
      ),
      { nome: "Instrutor Teste", qualificacao: "Eng." },
      ref
    );
  }
});

test("responsavelTecnicoDoCertificado: mesmas regras, com o registro no lugar da qualificação", () => {
  assert.deepEqual(
    responsavelTecnicoDoCertificado(
      {
        responsavel_tecnico_nome: "RT Teste",
        responsavel_tecnico_registro: "CREA-XX 0000",
        responsavel_tecnico_assinatura_ref: REF_RT,
      },
      EMPRESA
    ),
    { nome: "RT Teste", registro: "CREA-XX 0000", assinatura_ref: REF_RT }
  );
  assert.deepEqual(
    responsavelTecnicoDoCertificado(
      { responsavel_tecnico_nome: "RT Teste", responsavel_tecnico_registro: "CREA-XX 0000" },
      EMPRESA
    ),
    { nome: "RT Teste", registro: "CREA-XX 0000" }
  );
  assert.deepEqual(
    responsavelTecnicoDoCertificado(
      {
        responsavel_tecnico_nome: "RT Teste",
        responsavel_tecnico_assinatura_ref: "https://exemplo.base44.app/rt.png",
      },
      EMPRESA
    ),
    { nome: "RT Teste", registro: null }
  );
  assert.deepEqual(responsavelTecnicoDoCertificado({}, EMPRESA), { nome: null, registro: null });
});

test("a referência congelada entra no hash do certificado (mudar a imagem muda o hash)", async () => {
  const base = {
    aluno: { nome: "Aluno Teste" },
    instrutor: instrutorDoCertificado({ instrutor_nome: "Instrutor Teste" }, EMPRESA),
  };
  const assinado = {
    ...base,
    instrutor: instrutorDoCertificado(
      { instrutor_nome: "Instrutor Teste", instrutor_assinatura_ref: REF_INSTRUTOR },
      EMPRESA
    ),
  };
  const outraImagem = {
    ...base,
    instrutor: instrutorDoCertificado(
      {
        instrutor_nome: "Instrutor Teste",
        instrutor_assinatura_ref: `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/cccc-outra.png`,
      },
      EMPRESA
    ),
  };
  const assinatura = { hash_versao: 2 };
  const h0 = await hashDoCertificado("ABCD-2345-WXYZ", base, assinatura);
  const h1 = await hashDoCertificado("ABCD-2345-WXYZ", assinado, assinatura);
  const h2 = await hashDoCertificado("ABCD-2345-WXYZ", outraImagem, assinatura);
  assert.notEqual(h0, h1);
  assert.notEqual(h1, h2);
});

// ------------------------------------------------------------------ o que o aluno recebe
const certificado = (dados: unknown) => ({ matricula_id: "m-1", dados });
const dadosAssinados = () => ({
  aluno: { nome: "Aluno Teste" },
  instrutor: { nome: "Instrutor Teste", qualificacao: "Eng.", assinatura_ref: REF_INSTRUTOR },
  responsavel_tecnico: { nome: "RT Teste", registro: "CREA-XX 0000", assinatura_ref: REF_RT },
});

test("refsDasAssinaturas: junta as referências válidas dos certificados, sem repetir", () => {
  const refs = refsDasAssinaturas(
    [
      certificado(dadosAssinados()),
      certificado(dadosAssinados()),
      certificado({
        instrutor: { nome: "I", assinatura_ref: `${BUCKET_ASSINATURAS}/${OUTRA}/2026/10/x.png` },
        responsavel_tecnico: { nome: "R", assinatura_ref: "https://exemplo.base44.app/a.png" },
      }),
      certificado(null),
      certificado("texto"),
      certificado({ instrutor: "texto", responsavel_tecnico: null }),
    ],
    EMPRESA
  );
  assert.deepEqual([...refs].sort(), [REF_INSTRUTOR, REF_RT].sort());
  assert.deepEqual(refsDasAssinaturas([], EMPRESA), []);
  assert.deepEqual(refsDasAssinaturas(null, EMPRESA), []);
});

test("dadosParaOAluno: troca a referência por URL assinada e nunca devolve a referência", () => {
  const urls = new Map([
    [REF_INSTRUTOR, "https://armazenamento.exemplo/instrutor.png?token=sintetico"],
    [REF_RT, "https://armazenamento.exemplo/rt.jpg?token=sintetico"],
  ]);
  const saida = dadosParaOAluno(dadosAssinados(), EMPRESA, (ref) => urls.get(ref)) as Record<
    string,
    Record<string, unknown>
  >;
  assert.deepEqual(saida.instrutor, {
    nome: "Instrutor Teste",
    qualificacao: "Eng.",
    tem_assinatura: true,
    assinatura_url: "https://armazenamento.exemplo/instrutor.png?token=sintetico",
  });
  assert.deepEqual(saida.responsavel_tecnico, {
    nome: "RT Teste",
    registro: "CREA-XX 0000",
    tem_assinatura: true,
    assinatura_url: "https://armazenamento.exemplo/rt.jpg?token=sintetico",
  });
  assert.deepEqual(saida.aluno, { nome: "Aluno Teste" });
  assert.ok(!JSON.stringify(saida).includes("assinatura_ref"), "a referência vazou para o aluno");
  assert.ok(!JSON.stringify(saida).includes(EMPRESA), "o caminho da empresa vazou para o aluno");
});

test("dadosParaOAluno: URL que não foi possível assinar vira null, mas a tela sabe que há assinatura", () => {
  const saida = dadosParaOAluno(dadosAssinados(), EMPRESA, () => null) as Record<
    string,
    Record<string, unknown>
  >;
  assert.equal(saida.instrutor.tem_assinatura, true);
  assert.equal(saida.instrutor.assinatura_url, null);
});

test("dadosParaOAluno: certificado sem assinatura (inclusive o antigo) sai igual, sem chave nova", () => {
  const antigo = {
    aluno: { nome: "Aluno Teste" },
    instrutor: { nome: "Instrutor Teste", qualificacao: null },
    responsavel_tecnico: { nome: "RT Teste", registro: "CREA-XX 0000" },
  };
  assert.deepEqual(
    dadosParaOAluno(antigo, EMPRESA, () => "nunca"),
    antigo
  );
  // sem as chaves de pessoa (certificado muito antigo)
  assert.deepEqual(
    dadosParaOAluno({ aluno: { nome: "A" } }, EMPRESA, () => "nunca"),
    {
      aluno: { nome: "A" },
    }
  );
});

test("dadosParaOAluno: referência inválida gravada (de outra empresa, Base44) some e não conta como assinatura", () => {
  const dados = {
    instrutor: { nome: "I", assinatura_ref: `${BUCKET_ASSINATURAS}/${OUTRA}/2026/10/x.png` },
    responsavel_tecnico: { nome: "R", assinatura_ref: "https://exemplo.base44.app/a.png" },
  };
  let chamadas = 0;
  const saida = dadosParaOAluno(dados, EMPRESA, () => {
    chamadas++;
    return "https://armazenamento.exemplo/x.png";
  });
  assert.deepEqual(saida, { instrutor: { nome: "I" }, responsavel_tecnico: { nome: "R" } });
  assert.equal(chamadas, 0, "só referência válida da empresa é assinada");
});

test("dadosParaOAluno: não aceita `assinatura_url` ou `tem_assinatura` vindos do banco (só os do servidor)", () => {
  const saida = dadosParaOAluno(
    {
      instrutor: {
        nome: "I",
        assinatura_url: "https://atacante.exemplo/x.png",
        tem_assinatura: true,
      },
    },
    EMPRESA,
    () => null
  );
  assert.deepEqual(saida, { instrutor: { nome: "I" } });
});

test("dadosParaOAluno: não altera o objeto de entrada e tolera dados que não são objeto", () => {
  const entrada = dadosAssinados();
  const copia = structuredClone(entrada);
  dadosParaOAluno(entrada, EMPRESA, () => "https://armazenamento.exemplo/x.png");
  assert.deepEqual(entrada, copia);
  for (const v of [null, undefined, "texto", 7, []]) {
    assert.equal(
      dadosParaOAluno(v, EMPRESA, () => null),
      v
    );
  }
});

test("certificadoParaOAluno: mantém a linha e tira só a referência (sem URL: a tela recarrega os dados)", () => {
  const linha = {
    codigo: "ABCD-2345-WXYZ",
    revogado: false,
    dados: dadosAssinados(),
  };
  const saida = certificadoParaOAluno(linha, EMPRESA);
  assert.equal(saida.codigo, linha.codigo);
  assert.equal(saida.revogado, false);
  assert.ok(!JSON.stringify(saida).includes("assinatura_ref"));
  const dados = saida.dados as Record<string, Record<string, unknown>>;
  assert.equal(dados.instrutor.tem_assinatura, true);
  assert.equal(dados.instrutor.assinatura_url, null);
  // a linha de entrada não foi alterada
  assert.equal((linha.dados.instrutor as Record<string, unknown>).assinatura_ref, REF_INSTRUTOR);
});

// ------------------------------------------------------------------ o index.ts usa as regras
const codigoDoIndex = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join("\n");

test("index.ts: a emissão congela instrutor e RT pelas regras da T29 (com a empresa da sessão)", () => {
  assert.match(codigoDoIndex, /instrutor:\s*instrutorDoCertificado\(\s*curso\s*,\s*empresaId\s*\)/);
  assert.match(
    codigoDoIndex,
    /responsavel_tecnico:\s*responsavelTecnicoDoCertificado\(\s*curso\s*,\s*empresaId\s*\)/
  );
});

test("index.ts: a ação dados assina as imagens e o certificado vai ao aluno sem a referência", () => {
  assert.match(codigoDoIndex, /refsDasAssinaturas\(/);
  assert.match(codigoDoIndex, /dadosParaOAluno\(\s*cert\.dados\s*,\s*empresaId/);
});

test("index.ts: a ação certificado devolve `dados` sem a referência nos três caminhos", () => {
  const acao = codigoDoIndex.slice(codigoDoIndex.indexOf('body.acao === "certificado"'));
  // já existia, corrida no 23505 (os dois passam por certificadoParaOAluno) e recém-emitido
  assert.equal((acao.match(/certificadoParaOAluno\(/g) ?? []).length, 2);
  assert.match(
    acao,
    /certificado\.dados\s*=\s*dadosParaOAluno\(\s*certificado\.dados\s*,\s*empresaId/
  );
});

// ------------------------------------------------------------------ "|" (A6)
// Configurações guarda as assinaturas de todas as linhas de instrutor juntas, separadas por "|"
// (`instrutor_assinatura_url`): a junção de duas referências nunca carrega como imagem, e uma referência
// congelada no hash que nunca abre deixaria todo download do aluno com o aviso "não pôde ser carregada".
test("refDaAssinatura: a junção de várias referências com '|' não é uma referência", () => {
  for (const v of [
    `${REF_INSTRUTOR}|${REF_RT}`,
    `${REF_INSTRUTOR}|`,
    `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/a|b.png`,
    `|${REF_RT}`,
  ]) {
    assert.equal(refDaAssinatura(v, EMPRESA), null, v);
  }
  // sozinhas, as duas continuam valendo
  assert.equal(refDaAssinatura(REF_INSTRUTOR, EMPRESA), REF_INSTRUTOR);
  assert.equal(refDaAssinatura(REF_RT, EMPRESA), REF_RT);
});

test("0137: o CHECK das duas colunas também recusa '|' (mesma regra do servidor e do front)", () => {
  const sql = readFileSync(
    new URL("../../migrations/0137_treinamento_curso_assinaturas.sql", import.meta.url),
    "utf8"
  );
  for (const coluna of ["instrutor_assinatura_ref", "responsavel_tecnico_assinatura_ref"]) {
    const recusa = (caractere: string) => sql.includes(`position('${caractere}' in ${coluna}) = 0`);
    assert.ok(recusa("|"), `${coluna}: falta recusar "|"`);
    // e continua recusando o resto que o servidor recusa (barra invertida e dois-pontos)
    assert.ok(recusa("\\"), `${coluna}: falta recusar a barra invertida`);
    assert.ok(recusa(":"), `${coluna}: falta recusar ":"`);
  }
});
