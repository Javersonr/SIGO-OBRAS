import { describe, it, expect, vi } from "vitest";
import {
  ACCEPT_ASSINATURA,
  BUCKET_ASSINATURAS,
  LIMITE_ASSINATURA_BYTES,
  assinaturasQueFaltaram,
  aoEscolherPessoa,
  aoMudarNomeDaPessoa,
  aoTrocarImagemDaAssinatura,
  avisoAssinaturasNaoCarregadas,
  caberNaCaixa,
  carregarAssinaturasDoCertificado,
  formatoDaImagem,
  nomeParaEnvio,
  posicaoDaAssinatura,
  refDeAssinatura,
  semMarcasDeAssinatura,
  temAssinatura,
  validarImagemAssinatura,
} from "./ead-assinatura";

// Dados sintéticos: nenhuma empresa, pessoa ou assinatura real.
const EMPRESA = "empresa-teste";
const REF = `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/aaaa-assinatura.png`;
const IMG = { dataUrl: "data:image/png;base64,AAAA", w: 300, h: 100 };

describe("refDeAssinatura", () => {
  it("aceita só a referência 'assinaturas/<empresa>/...' de PNG ou JPEG", () => {
    expect(BUCKET_ASSINATURAS).toBe("assinaturas");
    expect(refDeAssinatura(REF, EMPRESA)).toBe(REF);
    expect(refDeAssinatura(`  ${REF} `, EMPRESA)).toBe(REF);
    expect(refDeAssinatura(`assinaturas/${EMPRESA}/x/ASS.JPG`, EMPRESA)).toBe(
      `assinaturas/${EMPRESA}/x/ASS.JPG`
    );
    expect(refDeAssinatura(`assinaturas/${EMPRESA}/x/ass.jpeg`, EMPRESA)).toBe(
      `assinaturas/${EMPRESA}/x/ass.jpeg`
    );
  });

  it("sem a empresa, só confere o formato (a pasta fica por conta da RLS e do servidor)", () => {
    expect(refDeAssinatura(REF)).toBe(REF);
    expect(refDeAssinatura(REF, null)).toBe(REF);
  });

  it("ignora a referência do Base44, URL, outro bucket, outra empresa e o que não é imagem", () => {
    for (const v of [
      "https://exemplo.base44.app/api/apps/1/files/public/1/assinatura.png",
      "https://media.base44.com/images/public/x/assinatura.png",
      `https://armazenamento.exemplo/storage/v1/object/sign/assinaturas/${EMPRESA}/a.png?token=x`,
      "data:image/png;base64,AAAA",
      `treinamentos/${EMPRESA}/2026/10/a.png`,
      `assinaturas/outra-empresa/2026/10/a.png`,
      `assinaturas/${EMPRESA}/../outra/a.png`,
      `assinaturas/${EMPRESA}//a.png`,
      `assinaturas/${EMPRESA}/a.pdf`,
      `assinaturas/${EMPRESA}/a`,
      `assinaturas/${EMPRESA}`,
      // "|" separa as assinaturas de várias linhas em Configurações: junção não é referência (A6)
      `${REF}|assinaturas/${EMPRESA}/2026/10/bbbb.png`,
      `assinaturas/${EMPRESA}/a|b.png`,
      "",
      "   ",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(refDeAssinatura(v, EMPRESA)).toBeNull();
    }
  });
});

describe("validarImagemAssinatura", () => {
  const arquivo = (props) => ({
    name: "assinatura.png",
    type: "image/png",
    size: 50_000,
    ...props,
  });

  it("aceita PNG e JPEG de tamanho razoável", () => {
    expect(validarImagemAssinatura(arquivo())).toEqual({ ok: true });
    expect(validarImagemAssinatura(arquivo({ name: "a.jpg", type: "image/jpeg" }))).toEqual({
      ok: true,
    });
    // o Windows às vezes não informa o tipo: vale a extensão
    expect(validarImagemAssinatura(arquivo({ name: "a.JPEG", type: "" }))).toEqual({ ok: true });
  });

  it("recusa o que o certificado não consegue desenhar, com orientação em português", () => {
    for (const a of [
      arquivo({ name: "a.pdf", type: "application/pdf" }),
      arquivo({ name: "a.svg", type: "image/svg+xml" }),
      arquivo({ name: "a.heic", type: "image/heic" }),
      arquivo({ name: "a.webp", type: "image/webp" }),
      arquivo({ name: "a.gif", type: "image/gif" }),
      arquivo({ name: "sem-extensao", type: "" }),
    ]) {
      const r = validarImagemAssinatura(a);
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/PNG ou JPEG/);
    }
  });

  it("recusa arquivo vazio, grande demais e a falta de arquivo", () => {
    expect(validarImagemAssinatura(arquivo({ size: 0 })).ok).toBe(false);
    const grande = validarImagemAssinatura(arquivo({ size: LIMITE_ASSINATURA_BYTES + 1 }));
    expect(grande.ok).toBe(false);
    expect(grande.erro).toMatch(/2 MB/);
    expect(validarImagemAssinatura(arquivo({ size: LIMITE_ASSINATURA_BYTES })).ok).toBe(true);
    expect(validarImagemAssinatura(null).ok).toBe(false);
  });

  it("o seletor de arquivo oferece só PNG e JPEG", () => {
    expect(ACCEPT_ASSINATURA).toContain("image/png");
    expect(ACCEPT_ASSINATURA).toContain("image/jpeg");
    expect(ACCEPT_ASSINATURA).not.toContain("pdf");
  });
});

describe("caberNaCaixa", () => {
  it("encolhe mantendo a proporção até caber na caixa", () => {
    // 300x100 numa caixa de 60x18: a altura manda (18 mm de altura, 54 de largura)
    const r = caberNaCaixa(300, 100, 60, 18);
    expect(r.h).toBeCloseTo(18);
    expect(r.w).toBeCloseTo(54);
    // 100x100: a altura manda também
    expect(caberNaCaixa(100, 100, 60, 18)).toEqual({ w: 18, h: 18 });
    // muito larga: a largura manda
    const larga = caberNaCaixa(1000, 100, 60, 18);
    expect(larga.w).toBeCloseTo(60);
    expect(larga.h).toBeCloseTo(6);
  });

  it("imagem pequena também enche a caixa (a assinatura não sai minúscula)", () => {
    const r = caberNaCaixa(30, 10, 60, 18);
    expect(r.w).toBeLessThanOrEqual(60);
    expect(r.h).toBeLessThanOrEqual(18);
    expect(r.h).toBeCloseTo(18);
  });

  it("tamanho inválido não desenha", () => {
    for (const [w, h] of [
      [0, 10],
      [10, 0],
      [-1, 10],
      [NaN, 10],
      [10, undefined],
    ]) {
      expect(caberNaCaixa(w, h, 60, 18)).toBeNull();
    }
  });
});

describe("nomeParaEnvio", () => {
  it("mantém o nome do arquivo quando ele já termina em PNG ou JPEG", () => {
    expect(nomeParaEnvio({ name: "assinatura.png", type: "image/png" })).toBe("assinatura.png");
    expect(nomeParaEnvio({ name: "Assinatura Final.JPG", type: "image/jpeg" })).toBe(
      "Assinatura Final.JPG"
    );
  });

  it("completa a extensão pelo tipo quando o nome não a tem (o caminho precisa terminar em .png/.jpg)", () => {
    expect(nomeParaEnvio({ name: "assinatura", type: "image/png" })).toBe("assinatura.png");
    expect(nomeParaEnvio({ name: "scan", type: "image/jpeg" })).toBe("scan.jpg");
    expect(nomeParaEnvio({ name: "", type: "image/png" })).toBe("assinatura.png");
    expect(nomeParaEnvio({ type: "image/jpeg" })).toBe("assinatura.jpg");
    // extensão que não confere com o tipo: vale o tipo
    expect(nomeParaEnvio({ name: "foto.heic", type: "image/jpeg" })).toBe("foto.heic.jpg");
  });
});

describe("formatoDaImagem", () => {
  it("reconhece PNG e JPEG pela data URL; o resto fica para o jsPDF recusar", () => {
    expect(formatoDaImagem("data:image/png;base64,AAAA")).toBe("PNG");
    expect(formatoDaImagem("DATA:IMAGE/PNG;base64,AAAA")).toBe("PNG");
    expect(formatoDaImagem("data:image/jpeg;base64,AAAA")).toBe("JPEG");
    expect(formatoDaImagem("data:image/jpg;base64,AAAA")).toBe("JPEG");
    expect(formatoDaImagem("data:image/svg+xml;base64,AAAA")).toBeUndefined();
    expect(formatoDaImagem("https://exemplo.test/a.png")).toBeUndefined();
    expect(formatoDaImagem(null)).toBeUndefined();
  });
});

describe("posicaoDaAssinatura", () => {
  it("centraliza a imagem na coluna e a apoia logo acima da linha da assinatura", () => {
    const p = posicaoDaAssinatura(100, 142, { w: 300, h: 100 });
    expect(p.h).toBeCloseTo(18);
    expect(p.w).toBeCloseTo(54);
    expect(p.x + p.w / 2).toBeCloseTo(100); // centrada no x da coluna
    expect(p.y + p.h).toBeLessThan(142); // termina antes da linha...
    expect(142 - (p.y + p.h)).toBeLessThan(3); // ...e fica colada nela
  });

  it("não passa da caixa nem invade o texto de cima: no máximo 64 x 18 mm", () => {
    const larga = posicaoDaAssinatura(100, 142, { w: 2000, h: 100 });
    expect(larga.w).toBeLessThanOrEqual(64);
    const alta = posicaoDaAssinatura(100, 142, { w: 100, h: 2000 });
    expect(alta.h).toBeLessThanOrEqual(18);
    expect(alta.y).toBeGreaterThanOrEqual(142 - 18 - 3);
  });

  it("imagem sem medida não tem posição", () => {
    expect(posicaoDaAssinatura(100, 142, { w: 0, h: 0 })).toBeNull();
    expect(posicaoDaAssinatura(100, 142, null)).toBeNull();
  });
});

describe("temAssinatura", () => {
  it("vale a marca do servidor (aluno) ou a referência congelada (RH)", () => {
    expect(temAssinatura({ tem_assinatura: true })).toBe(true);
    expect(temAssinatura({ assinatura_ref: REF })).toBe(true);
    expect(temAssinatura({ nome: "Sem imagem" })).toBe(false);
    expect(temAssinatura(null)).toBe(false);
    expect(temAssinatura(undefined)).toBe(false);
  });
});

describe("carregarAssinaturasDoCertificado", () => {
  const dados = {
    instrutor: {
      nome: "Instrutor Teste",
      tem_assinatura: true,
      assinatura_url: "https://a.exemplo/i",
    },
    responsavel_tecnico: {
      nome: "RT Teste",
      tem_assinatura: true,
      assinatura_url: "https://a.exemplo/r",
    },
  };
  const urlDoAluno = (pessoa) => pessoa.assinatura_url;

  it("carrega a imagem de cada um que tem assinatura", async () => {
    const carregar = vi.fn(async () => IMG);
    const r = await carregarAssinaturasDoCertificado(dados, { urlDe: urlDoAluno, carregar });
    expect(r).toEqual({
      imagens: { instrutor: IMG, responsavel_tecnico: IMG },
      naoCarregadas: [],
    });
    expect(carregar).toHaveBeenCalledTimes(2);
    expect(carregar.mock.calls.map((c) => c[0]).sort()).toEqual([
      "https://a.exemplo/i",
      "https://a.exemplo/r",
    ]);
  });

  it("quem não tem assinatura não é carregado nem conta como falha (certificado só com nome e registro)", async () => {
    const carregar = vi.fn(async () => IMG);
    const r = await carregarAssinaturasDoCertificado(
      {
        instrutor: { nome: "Instrutor Teste", qualificacao: "Eng." },
        responsavel_tecnico: { nome: "RT Teste", registro: "CREA-XX 0000" },
      },
      { urlDe: urlDoAluno, carregar }
    );
    expect(r).toEqual({
      imagens: { instrutor: null, responsavel_tecnico: null },
      naoCarregadas: [],
    });
    expect(carregar).not.toHaveBeenCalled();
    // certificado muito antigo, sem as chaves
    expect(await carregarAssinaturasDoCertificado({}, { urlDe: urlDoAluno, carregar })).toEqual({
      imagens: { instrutor: null, responsavel_tecnico: null },
      naoCarregadas: [],
    });
    expect(await carregarAssinaturasDoCertificado(null, { urlDe: urlDoAluno, carregar })).toEqual({
      imagens: { instrutor: null, responsavel_tecnico: null },
      naoCarregadas: [],
    });
  });

  it("imagem que não carrega, ou URL que o servidor não conseguiu assinar, vira aviso e não derruba o PDF", async () => {
    const carregar = vi.fn(async (url) => (url.endsWith("/i") ? null : IMG));
    const r = await carregarAssinaturasDoCertificado(dados, { urlDe: urlDoAluno, carregar });
    expect(r.imagens).toEqual({ instrutor: null, responsavel_tecnico: IMG });
    expect(r.naoCarregadas).toEqual(["instrutor"]);

    const semUrl = await carregarAssinaturasDoCertificado(
      {
        instrutor: { nome: "I", tem_assinatura: true, assinatura_url: null },
        responsavel_tecnico: { nome: "R", tem_assinatura: true, assinatura_url: null },
      },
      { urlDe: urlDoAluno, carregar }
    );
    expect(semUrl.naoCarregadas).toEqual(["instrutor", "responsavel_tecnico"]);
    expect(carregar).toHaveBeenCalledTimes(2); // só o primeiro cenário: sem URL nem tenta
  });

  it("erro ao resolver a URL ou ao carregar é tratado como imagem que não carregou", async () => {
    const r = await carregarAssinaturasDoCertificado(dados, {
      urlDe: async () => {
        throw new Error("sem sessão");
      },
      carregar: async () => {
        throw new Error("rede");
      },
    });
    expect(r.imagens).toEqual({ instrutor: null, responsavel_tecnico: null });
    expect(r.naoCarregadas).toEqual(["instrutor", "responsavel_tecnico"]);
  });

  it("o RH resolve a referência congelada pela própria sessão", async () => {
    const dadosDoRh = {
      instrutor: { nome: "I", assinatura_ref: REF },
      responsavel_tecnico: { nome: "R", assinatura_ref: `${BUCKET_ASSINATURAS}/${EMPRESA}/b.jpg` },
    };
    const resolver = vi.fn(async (ref) => `https://assinada.exemplo/${ref}`);
    const carregar = vi.fn(async () => IMG);
    const r = await carregarAssinaturasDoCertificado(dadosDoRh, {
      urlDe: (pessoa) => resolver(pessoa.assinatura_ref),
      carregar,
    });
    expect(r.naoCarregadas).toEqual([]);
    expect(resolver).toHaveBeenCalledWith(REF);
    expect(carregar).toHaveBeenCalledWith(`https://assinada.exemplo/${REF}`);
  });
});

describe("assinaturasQueFaltaram", () => {
  it("soma as que não carregaram com as que carregaram mas o PDF não aceitou", () => {
    const carregadas = {
      imagens: { instrutor: IMG, responsavel_tecnico: null },
      naoCarregadas: ["responsavel_tecnico"],
    };
    // o PDF não desenhou a do instrutor, e a do RT nem chegou a ele
    expect(assinaturasQueFaltaram(carregadas, [])).toEqual(["instrutor", "responsavel_tecnico"]);
    // a do instrutor saiu; só a do RT faltou
    expect(assinaturasQueFaltaram(carregadas, ["instrutor"])).toEqual(["responsavel_tecnico"]);
  });

  it("tudo desenhado, ou ninguém tem assinatura: nada faltou", () => {
    expect(
      assinaturasQueFaltaram(
        { imagens: { instrutor: IMG, responsavel_tecnico: IMG }, naoCarregadas: [] },
        ["instrutor", "responsavel_tecnico"]
      )
    ).toEqual([]);
    expect(
      assinaturasQueFaltaram(
        { imagens: { instrutor: null, responsavel_tecnico: null }, naoCarregadas: [] },
        []
      )
    ).toEqual([]);
    expect(assinaturasQueFaltaram(undefined, undefined)).toEqual([]);
  });
});

describe("avisoAssinaturasNaoCarregadas", () => {
  it("sem falha, sem aviso", () => {
    expect(avisoAssinaturasNaoCarregadas([])).toBe("");
    expect(avisoAssinaturasNaoCarregadas(undefined)).toBe("");
  });

  it("diz de quem foi a imagem que faltou e que o resto do certificado não muda", () => {
    expect(avisoAssinaturasNaoCarregadas(["instrutor"])).toMatch(/do instrutor/);
    expect(avisoAssinaturasNaoCarregadas(["responsavel_tecnico"])).toMatch(
      /do responsável técnico/
    );
    const dois = avisoAssinaturasNaoCarregadas(["instrutor", "responsavel_tecnico"]);
    expect(dois).toMatch(/do instrutor e do responsável técnico/);
    expect(dois).toMatch(/QR Code/);
    expect(dois).toMatch(/baixe de novo/);
  });
});

describe("aoMudarNomeDaPessoa (a imagem é de quem assina: mudou o nome, a imagem sai)", () => {
  const curso = {
    id: "curso-1",
    nome: "NR-35",
    responsavel_tecnico_nome: "Fulano de Tal",
    responsavel_tecnico_registro: "CREA 123",
    responsavel_tecnico_assinatura_ref: REF,
    instrutor_nome: "Ciclana Exemplo",
    instrutor_qualificacao: "Eng. de Segurança",
    instrutor_assinatura_ref: `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/bbbb-instrutor.jpg`,
  };

  it("nome de outra pessoa no RT: tira a imagem do RT, avisa e não mexe no resto nem no instrutor", () => {
    const r = aoMudarNomeDaPessoa(curso, "responsavel_tecnico", "Beltrano");
    expect(r.imagemRetirada).toBe(true);
    expect(r.curso.responsavel_tecnico_nome).toBe("Beltrano");
    expect(r.curso.responsavel_tecnico_assinatura_ref).toBeNull();
    expect(r.curso.responsavel_tecnico_registro).toBe("CREA 123");
    expect(r.curso.instrutor_nome).toBe("Ciclana Exemplo");
    expect(r.curso.instrutor_assinatura_ref).toBe(curso.instrutor_assinatura_ref);
    expect(r.curso.nome).toBe("NR-35");
    expect(r.aviso).toMatch(/imagem da assinatura do responsável técnico/);
    expect(r.aviso).toMatch(/nome mudou/);
    // o nome digitado até ali pode estar pela metade ("Beltr"): o aviso não o repete
    expect(r.aviso).not.toMatch(/Beltrano/);
    expect(r.aviso).toMatch(/anexe a imagem/i);
  });

  it("nome de outra pessoa no instrutor: tira só a imagem do instrutor", () => {
    const r = aoMudarNomeDaPessoa(curso, "instrutor", "Fulaninho");
    expect(r.imagemRetirada).toBe(true);
    expect(r.curso.instrutor_nome).toBe("Fulaninho");
    expect(r.curso.instrutor_assinatura_ref).toBeNull();
    expect(r.curso.instrutor_qualificacao).toBe("Eng. de Segurança");
    expect(r.curso.responsavel_tecnico_nome).toBe("Fulano de Tal");
    expect(r.curso.responsavel_tecnico_assinatura_ref).toBe(REF);
    expect(r.aviso).toMatch(/assinatura do instrutor/);
  });

  it("digitando letra por letra, o aviso sai uma vez só (na primeira letra que muda o nome)", () => {
    let atual = curso;
    const avisos = [];
    for (const v of ["Fulano de Ta", "Fulano de T", "Fulano de", "Beltrano"]) {
      const r = aoMudarNomeDaPessoa(atual, "responsavel_tecnico", v);
      if (r.aviso) avisos.push(r.aviso);
      atual = r.curso;
    }
    expect(avisos).toHaveLength(1);
    expect(atual.responsavel_tecnico_nome).toBe("Beltrano");
    expect(atual.responsavel_tecnico_assinatura_ref).toBeNull();
  });

  it("nome digitado à mão que já tinha imagem anexada e é trocado direto no campo: também retira", () => {
    const daMao = { ...curso, instrutor_nome: "Digitado A Mao" };
    const r = aoMudarNomeDaPessoa(daMao, "instrutor", "Digitado B");
    expect(r.imagemRetirada).toBe(true);
    expect(r.curso.instrutor_assinatura_ref).toBeNull();
  });

  it("'— escolher dos salvos —' (nome vazio): a imagem sai junto, porque imagem sem nome não vale", () => {
    for (const vazio of ["", "   ", null, undefined]) {
      const r = aoMudarNomeDaPessoa(curso, "responsavel_tecnico", vazio);
      expect(r.imagemRetirada).toBe(true);
      expect(r.curso.responsavel_tecnico_nome).toBe(vazio ?? ""); // o texto fica como veio (sem null)
      expect(r.curso.responsavel_tecnico_assinatura_ref).toBeNull();
      expect(r.aviso).toMatch(/imagem da assinatura do responsável técnico/);
      expect(r.aviso).toMatch(/nome foi apagado/);
      expect(r.aviso).not.toMatch(/undefined|null/);
    }
  });

  it("o mesmo nome (espaço sobrando, maiúscula, espaço duplo) é a mesma pessoa: a imagem fica", () => {
    for (const v of ["Fulano de Tal ", "  fulano de tal", "FULANO DE TAL", "Fulano  de   Tal"]) {
      const r = aoMudarNomeDaPessoa(curso, "responsavel_tecnico", v);
      expect(r.imagemRetirada).toBe(false);
      expect(r.aviso).toBe("");
      expect(r.curso.responsavel_tecnico_nome).toBe(v);
      expect(r.curso.responsavel_tecnico_assinatura_ref).toBe(REF);
    }
  });

  it("sem imagem no curso: só troca o nome, sem aviso e sem inventar o campo da imagem", () => {
    const semImagem = { id: "curso-2", responsavel_tecnico_nome: "Fulano de Tal" };
    const r = aoMudarNomeDaPessoa(semImagem, "responsavel_tecnico", "Beltrano");
    expect(r).toEqual({
      curso: { id: "curso-2", responsavel_tecnico_nome: "Beltrano" },
      imagemRetirada: false,
      aviso: "",
    });
    const nula = { ...semImagem, responsavel_tecnico_assinatura_ref: null };
    expect(aoMudarNomeDaPessoa(nula, "responsavel_tecnico", "Beltrano").curso).toEqual({
      ...nula,
      responsavel_tecnico_nome: "Beltrano",
    });
  });

  it("curso novo, sem nome nenhum: digitar o primeiro nome não retira nada", () => {
    const r = aoMudarNomeDaPessoa({ rascunho: 1 }, "instrutor", "Novo");
    expect(r.imagemRetirada).toBe(false);
    expect(r.aviso).toBe("");
    expect(r.curso).toEqual({ rascunho: 1, instrutor_nome: "Novo" });
  });

  it("imagem que o formulário nem mostra (referência do Base44) sai em silêncio ao mudar o nome", () => {
    const antiga = { ...curso, instrutor_assinatura_ref: "https://app.base44.app/api/x.png" };
    const r = aoMudarNomeDaPessoa(antiga, "instrutor", "Fulaninho");
    expect(r.curso.instrutor_assinatura_ref).toBeNull();
    expect(r.imagemRetirada).toBe(false);
    expect(r.aviso).toBe("");
  });

  it("não altera o objeto de entrada", () => {
    const copia = JSON.parse(JSON.stringify(curso));
    aoMudarNomeDaPessoa(curso, "responsavel_tecnico", "Beltrano");
    expect(curso).toEqual(copia);
  });

  it("pessoa desconhecida é erro de quem chamou (nunca grava campo inventado)", () => {
    expect(() => aoMudarNomeDaPessoa(curso, "tutor", "X")).toThrow(/desconhecid/);
  });
});

describe("imagem anexada antes do nome (A6, N1): o nome digitado depois é de quem assina", () => {
  const REF_B = `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/cccc-rt.png`;
  const novo = { rascunho: "r1", nome: "NR-10" };

  it("curso novo: anexa a imagem do RT sem nome e digita o nome letra por letra, sem perder a imagem", () => {
    let atual = aoTrocarImagemDaAssinatura({
      atual: novo,
      formulario: novo,
      pessoa: "responsavel_tecnico",
      ref: REF_B,
    }).curso;
    expect(atual.responsavel_tecnico_assinatura_ref).toBe(REF_B);
    for (const v of ["B", "Be", "Bel", "Beltrano", "Beltrano S", "Beltrano Silva"]) {
      const r = aoMudarNomeDaPessoa(atual, "responsavel_tecnico", v);
      expect(r.imagemRetirada, v).toBe(false);
      expect(r.aviso, v).toBe("");
      expect(r.curso.responsavel_tecnico_assinatura_ref, v).toBe(REF_B);
      atual = r.curso;
    }
    expect(atual.responsavel_tecnico_nome).toBe("Beltrano Silva");
  });

  it("apagar o nome que estava sendo digitado também não retira a imagem sem dono", () => {
    let atual = aoTrocarImagemDaAssinatura({
      atual: novo,
      formulario: novo,
      pessoa: "instrutor",
      ref: REF_B,
    }).curso;
    atual = aoMudarNomeDaPessoa(atual, "instrutor", "Fulano").curso;
    const r = aoMudarNomeDaPessoa(atual, "instrutor", "");
    expect(r.imagemRetirada).toBe(false);
    expect(r.curso.instrutor_assinatura_ref).toBe(REF_B);
  });

  it("depois de salvar, a imagem passa a ser de quem assina: mudar o nome a retira de novo", () => {
    let atual = aoTrocarImagemDaAssinatura({
      atual: novo,
      formulario: novo,
      pessoa: "responsavel_tecnico",
      ref: REF_B,
    }).curso;
    atual = aoMudarNomeDaPessoa(atual, "responsavel_tecnico", "Fulano de Tal").curso;
    atual = semMarcasDeAssinatura(atual);
    // as marcas são só da tela: não ficam no objeto que segue depois de salvar
    expect(Object.keys(atual).filter((k) => /sem_dono/.test(k))).toEqual([]);
    expect(atual.responsavel_tecnico_assinatura_ref).toBe(REF_B);
    const r = aoMudarNomeDaPessoa(atual, "responsavel_tecnico", "Beltrano");
    expect(r.imagemRetirada).toBe(true);
    expect(r.curso.responsavel_tecnico_assinatura_ref).toBeNull();
  });

  it("curso carregado com nome e imagem (gravados): mudar o nome continua retirando a imagem", () => {
    const gravado = {
      id: "curso-1",
      instrutor_nome: "Ciclana Exemplo",
      instrutor_assinatura_ref: REF,
    };
    const r = aoMudarNomeDaPessoa(gravado, "instrutor", "Ciclana Exemplo Junior");
    expect(r.imagemRetirada).toBe(true);
    expect(r.curso.instrutor_assinatura_ref).toBeNull();
    expect(Object.keys(r.curso).filter((k) => /sem_dono/.test(k))).toEqual([]);
  });

  it("curso gravado com imagem e SEM nome (dado antigo): o primeiro nome digitado adota a imagem", () => {
    const antigo = { id: "curso-2", instrutor_nome: "", instrutor_assinatura_ref: REF };
    let atual = antigo;
    for (const v of ["F", "Fu", "Fulano"]) atual = aoMudarNomeDaPessoa(atual, "instrutor", v).curso;
    expect(atual.instrutor_assinatura_ref).toBe(REF);
  });

  it("semMarcasDeAssinatura não altera a entrada e devolve o mesmo objeto se não há marca", () => {
    const sem = { id: "x", instrutor_nome: "A" };
    expect(semMarcasDeAssinatura(sem)).toBe(sem);
    const com = {
      id: "x",
      instrutor_assinatura_sem_dono: true,
      responsavel_tecnico_assinatura_sem_dono: true,
    };
    const copia = { ...com };
    expect(semMarcasDeAssinatura(com)).toEqual({ id: "x" });
    expect(com).toEqual(copia);
  });
});

describe("aoTrocarImagemDaAssinatura (A6, N3): a imagem enviada só vale para quem assinava no começo do envio", () => {
  const REF_NOVA = `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/dddd-nova.png`;
  const aberto = {
    id: "curso-1",
    responsavel_tecnico_nome: "Fulano de Tal",
    responsavel_tecnico_assinatura_ref: REF,
  };

  it("mesmo formulário e mesmo nome: a imagem nova entra, sem aviso", () => {
    const r = aoTrocarImagemDaAssinatura({
      atual: { ...aberto, responsavel_tecnico_nome: " fulano  de TAL " },
      formulario: aberto,
      pessoa: "responsavel_tecnico",
      ref: REF_NOVA,
    });
    expect(r.aplicada).toBe(true);
    expect(r.aviso).toBe("");
    expect(r.curso.responsavel_tecnico_assinatura_ref).toBe(REF_NOVA);
  });

  it("o RH escolheu outra pessoa (ou mudou o nome) durante o envio: a imagem é descartada e ele é avisado", () => {
    for (const nomeAgora of ["Beltrano", "", "Fulano de Tal Junior"]) {
      const atual = {
        ...aberto,
        responsavel_tecnico_nome: nomeAgora,
        responsavel_tecnico_assinatura_ref: null,
      };
      const r = aoTrocarImagemDaAssinatura({
        atual,
        formulario: aberto,
        pessoa: "responsavel_tecnico",
        ref: REF_NOVA,
      });
      expect(r.aplicada, nomeAgora).toBe(false);
      expect(r.curso, nomeAgora).toBe(atual);
      expect(r.aviso, nomeAgora).toMatch(/assinatura do responsável técnico/);
      expect(r.aviso, nomeAgora).toMatch(/mudou durante o envio/);
      expect(r.aviso, nomeAgora).toMatch(/anexe de novo/i);
    }
  });

  it("a outra pessoa do curso não interfere (a conferência é da pessoa que recebeu a imagem)", () => {
    const atual = { ...aberto, instrutor_nome: "Outro Nome" };
    const r = aoTrocarImagemDaAssinatura({
      atual,
      formulario: { ...aberto, instrutor_nome: "Ciclana" },
      pessoa: "responsavel_tecnico",
      ref: REF_NOVA,
    });
    expect(r.aplicada).toBe(true);
    expect(r.curso.responsavel_tecnico_assinatura_ref).toBe(REF_NOVA);
  });

  it("o RH abriu outro curso durante o envio: nada é gravado nele e o aviso diz isso", () => {
    const outro = { id: "curso-2", responsavel_tecnico_nome: "Fulano de Tal" };
    const r = aoTrocarImagemDaAssinatura({
      atual: outro,
      formulario: aberto,
      pessoa: "responsavel_tecnico",
      ref: REF_NOVA,
    });
    expect(r.aplicada).toBe(false);
    expect(r.curso).toBe(outro);
    expect(r.aviso).toMatch(/outro curso|formulário/i);
    // painel fechado
    expect(
      aoTrocarImagemDaAssinatura({
        atual: null,
        formulario: aberto,
        pessoa: "instrutor",
        ref: REF_NOVA,
      }).aplicada
    ).toBe(false);
  });

  it("remover a imagem (ref null) vale no mesmo formulário, mesmo que o nome tenha mudado, e limpa a marca", () => {
    const atual = {
      ...aberto,
      responsavel_tecnico_nome: "Beltrano",
      responsavel_tecnico_assinatura_sem_dono: true,
    };
    const r = aoTrocarImagemDaAssinatura({
      atual,
      formulario: aberto,
      pessoa: "responsavel_tecnico",
      ref: null,
    });
    expect(r.aplicada).toBe(true);
    expect(r.curso.responsavel_tecnico_assinatura_ref).toBeNull();
    expect(r.curso.responsavel_tecnico_assinatura_sem_dono).toBeUndefined();
  });

  it("imagem enviada com o nome vazio entra, mesmo que o RH tenha digitado o nome durante o envio", () => {
    const comeco = { id: "curso-3", instrutor_nome: "" };
    const atual = { ...comeco, instrutor_nome: "Fulano" };
    const r = aoTrocarImagemDaAssinatura({
      atual,
      formulario: comeco,
      pessoa: "instrutor",
      ref: REF_NOVA,
    });
    expect(r.aplicada).toBe(true);
    expect(r.curso.instrutor_assinatura_ref).toBe(REF_NOVA);
    // continua sem dono até salvar: o resto do nome digitado não a tira
    expect(aoMudarNomeDaPessoa(r.curso, "instrutor", "Fulano de Tal").imagemRetirada).toBe(false);
  });

  it("pessoa desconhecida é erro de quem chamou", () => {
    expect(() =>
      aoTrocarImagemDaAssinatura({ atual: aberto, formulario: aberto, pessoa: "tutor", ref: REF })
    ).toThrow(/desconhecid/);
  });
});

describe("aoEscolherPessoa (A6, N4): escolher da lista avisa quando uma imagem do curso é retirada", () => {
  const curso = {
    id: "curso-1",
    responsavel_tecnico_nome: "Fulano de Tal",
    responsavel_tecnico_registro: "CREA 123",
    responsavel_tecnico_assinatura_ref: REF,
    instrutor_nome: "Ciclana Exemplo",
    instrutor_qualificacao: "Eng. de Segurança",
    instrutor_assinatura_ref: null,
  };

  it("pessoa com imagem em Configurações: nome, registro e a imagem dela entram juntos, sem aviso", () => {
    const REF_P = `${BUCKET_ASSINATURAS}/${EMPRESA}/2026/10/eeee-p.png`;
    const r = aoEscolherPessoa(curso, "responsavel_tecnico", {
      nome: "Beltrano",
      registro: "CREA 999",
      assinatura_ref: REF_P,
    });
    expect(r.curso).toMatchObject({
      responsavel_tecnico_nome: "Beltrano",
      responsavel_tecnico_registro: "CREA 999",
      responsavel_tecnico_assinatura_ref: REF_P,
    });
    expect(r.imagemRetirada).toBe(false);
    expect(r.aviso).toBe("");
  });

  it("pessoa SEM imagem em Configurações: a imagem de quem estava antes sai e o RH é avisado", () => {
    const r = aoEscolherPessoa(curso, "responsavel_tecnico", { nome: "Beltrano", registro: "" });
    expect(r.curso.responsavel_tecnico_nome).toBe("Beltrano");
    // o registro de quem estava antes fica (comportamento anterior, fora da T29)
    expect(r.curso.responsavel_tecnico_registro).toBe("CREA 123");
    expect(r.curso.responsavel_tecnico_assinatura_ref).toBeNull();
    expect(r.imagemRetirada).toBe(true);
    expect(r.aviso).toMatch(/imagem da assinatura do responsável técnico/);
    expect(r.aviso).toMatch(/retirada/);
    expect(r.aviso).toMatch(/não tem imagem em Configurações/);
    expect(r.aviso).not.toMatch(/Beltrano|undefined|null/);
  });

  it("é a MESMA pessoa (o nome já estava digitado igual): a imagem que o RH anexou fica", () => {
    for (const nome of ["Fulano de Tal", "  fulano  DE tal "]) {
      const r = aoEscolherPessoa(curso, "responsavel_tecnico", { nome, assinatura_ref: null });
      expect(r.curso.responsavel_tecnico_assinatura_ref, nome).toBe(REF);
      expect(r.imagemRetirada, nome).toBe(false);
      expect(r.aviso, nome).toBe("");
    }
  });

  it("curso sem imagem visível (nenhuma, ou do sistema antigo): nada a avisar", () => {
    const r = aoEscolherPessoa(curso, "instrutor", { nome: "Novo Instrutor", qualificacao: "" });
    expect(r.curso.instrutor_nome).toBe("Novo Instrutor");
    expect(r.curso.instrutor_qualificacao).toBe("Eng. de Segurança");
    expect(r.curso.instrutor_assinatura_ref).toBeNull();
    expect(r.aviso).toBe("");
    const antigo = { ...curso, instrutor_assinatura_ref: "https://app.base44.app/api/x.png" };
    const r2 = aoEscolherPessoa(antigo, "instrutor", { nome: "Outro" });
    expect(r2.curso.instrutor_assinatura_ref).toBeNull();
    expect(r2.imagemRetirada).toBe(false);
    expect(r2.aviso).toBe("");
  });

  it("limpa a marca de imagem sem dono e não altera a entrada", () => {
    const comMarca = { ...curso, responsavel_tecnico_assinatura_sem_dono: true };
    const copia = JSON.parse(JSON.stringify(comMarca));
    const r = aoEscolherPessoa(comMarca, "responsavel_tecnico", { nome: "Beltrano" });
    expect(r.curso.responsavel_tecnico_assinatura_sem_dono).toBeUndefined();
    expect(comMarca).toEqual(copia);
  });

  it("pessoa desconhecida é erro de quem chamou", () => {
    expect(() => aoEscolherPessoa(curso, "tutor", { nome: "X" })).toThrow(/desconhecid/);
  });
});
