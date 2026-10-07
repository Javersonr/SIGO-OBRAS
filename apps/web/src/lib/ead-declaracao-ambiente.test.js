import { describe, it, expect } from "vitest";
import {
  ART_MAX,
  EVENTO_DECLARACAO_AMBIENTE,
  ITENS_DA_DECLARACAO,
  TEXTO_MAX,
  TEXTO_MIN,
  TEXTO_PADRAO_DA_DECLARACAO,
  declaracaoVigente,
  historicoDeVersoes,
  igualAoVigente,
  normalizarDeclaracao,
  proximaVersaoDaDeclaracao,
  validarDeclaracaoDoRT,
} from "./ead-declaracao-ambiente";

/**
 * Declaração de ambiente e horário, lado do RH e do RT (T35). O espelho exato do servidor (texto padrão, itens,
 * limites e a escolha da versão) é conferido em `declaracao-ambiente.test.ts`; aqui, o que só a tela usa.
 */
const texto = (n) => `Texto da versão ${n}, com mais de vinte caracteres.`;

describe("o texto padrão e os itens", () => {
  it("o padrão é neutro, cabe nos limites e não traz dado pessoal", () => {
    expect(TEXTO_PADRAO_DA_DECLARACAO.length).toBeGreaterThanOrEqual(TEXTO_MIN);
    expect(TEXTO_PADRAO_DA_DECLARACAO.length).toBeLessThanOrEqual(TEXTO_MAX);
    expect(TEXTO_PADRAO_DA_DECLARACAO).not.toMatch(/@|\d{3}\.\d{3}\.\d{3}/);
  });

  it("são três itens, um por requisito do Anexo II (local, horário, exclusividade)", () => {
    expect(ITENS_DA_DECLARACAO.map((i) => i.id)).toEqual([
      "local_adequado",
      "horario_reservado",
      "sem_outra_atividade",
    ]);
    for (const i of ITENS_DA_DECLARACAO) expect(i.rotulo.length).toBeGreaterThan(10);
  });

  it("o evento é o que o servidor grava na trilha", () => {
    expect(EVENTO_DECLARACAO_AMBIENTE).toBe("declaracao_ambiente");
  });
});

describe("declaracaoVigente", () => {
  it("sem versão salva vale o padrão, pendente de aprovação do RT (versão 0)", () => {
    for (const vazio of [[], null, undefined, "x"]) {
      expect(declaracaoVigente(vazio)).toEqual({
        versao: 0,
        texto: TEXTO_PADRAO_DA_DECLARACAO,
        art: null,
        aprovado: false,
      });
    }
  });

  it("vale a versão de maior número; a ART vazia vira null", () => {
    const v = declaracaoVigente([
      { versao: 1, texto: texto(1), art: "ART 1" },
      { versao: 2, texto: `  ${texto(2)}  `, art: "   " },
    ]);
    expect(v).toEqual({ versao: 2, texto: texto(2), art: null, aprovado: true });
  });

  it("linha estragada nunca vira o texto em vigor", () => {
    const v = declaracaoVigente([
      { versao: 5, texto: "curto" },
      { versao: "6", texto: texto(6) },
      { versao: 0, texto: texto(0) },
      { versao: 1, texto: texto(1) },
    ]);
    expect(v.versao).toBe(1);
  });
});

describe("validarDeclaracaoDoRT", () => {
  it("aceita um texto dentro dos limites, com ou sem ART", () => {
    expect(validarDeclaracaoDoRT({ texto: texto(1) })).toEqual({ ok: true, erros: {} });
    expect(validarDeclaracaoDoRT({ texto: texto(1), art: "ART 12345" }).ok).toBe(true);
  });

  it("recusa texto curto (só espaços não contam) e longo demais", () => {
    expect(validarDeclaracaoDoRT({ texto: "curto" }).erros.texto).toMatch(/pelo menos 20/);
    expect(validarDeclaracaoDoRT({ texto: " ".repeat(40) }).ok).toBe(false);
    const longo = validarDeclaracaoDoRT({ texto: "x".repeat(TEXTO_MAX + 1) });
    expect(longo.ok).toBe(false);
    expect(longo.erros.texto).toMatch(/4000/);
    expect(validarDeclaracaoDoRT({ texto: "x".repeat(TEXTO_MAX) }).ok).toBe(true);
  });

  it("a ART passa de 120 caracteres: recusa; vazia vale", () => {
    expect(
      validarDeclaracaoDoRT({ texto: texto(1), art: "A".repeat(ART_MAX + 1) }).erros.art
    ).toMatch(/120/);
    expect(validarDeclaracaoDoRT({ texto: texto(1), art: "A".repeat(ART_MAX) }).ok).toBe(true);
    expect(validarDeclaracaoDoRT({ texto: texto(1), art: "   " }).ok).toBe(true);
    expect(validarDeclaracaoDoRT().ok).toBe(false);
  });
});

describe("igualAoVigente e proximaVersaoDaDeclaracao", () => {
  const vigente = declaracaoVigente([{ versao: 3, texto: texto(3), art: "ART 3" }]);

  it("o mesmo texto e a mesma ART (ignorando espaços nas pontas) não geram versão nova", () => {
    expect(igualAoVigente(vigente, { texto: ` ${texto(3)} `, art: " ART 3 " })).toBe(true);
    expect(igualAoVigente(vigente, { texto: texto(3), art: "ART 3" })).toBe(true);
  });

  it("mudar o texto OU a ART gera versão nova", () => {
    expect(igualAoVigente(vigente, { texto: texto(4), art: "ART 3" })).toBe(false);
    expect(igualAoVigente(vigente, { texto: texto(3), art: "ART 4" })).toBe(false);
    expect(igualAoVigente(vigente, { texto: texto(3), art: "" })).toBe(false);
  });

  it("salvar o texto padrão como está É a aprovação dele (nunca 'igual')", () => {
    const padrao = declaracaoVigente([]);
    expect(igualAoVigente(padrao, { texto: TEXTO_PADRAO_DA_DECLARACAO, art: "" })).toBe(false);
  });

  it("a próxima versão é a seguinte à em vigor (a 1 quando só há o padrão)", () => {
    expect(proximaVersaoDaDeclaracao([])).toBe(1);
    expect(
      proximaVersaoDaDeclaracao([
        { versao: 1, texto: texto(1) },
        { versao: 2, texto: texto(2) },
      ])
    ).toBe(3);
  });
});

describe("normalizarDeclaracao e historicoDeVersoes", () => {
  it("apara o texto e transforma a ART vazia em null", () => {
    expect(normalizarDeclaracao({ texto: "  abc  ", art: "  " })).toEqual({
      texto: "abc",
      art: null,
    });
    expect(normalizarDeclaracao()).toEqual({ texto: "", art: null });
  });

  it("o histórico lista só versões válidas, da mais nova para a mais antiga, com quem salvou", () => {
    const h = historicoDeVersoes([
      {
        versao: 1,
        texto: texto(1),
        art: null,
        created_at: "2026-10-01T10:00:00Z",
        salvo_por_email: "rt@exemplo.test",
      },
      { versao: 3, texto: "curto" },
      {
        versao: 2,
        texto: texto(2),
        art: "ART 2",
        created_at: "2026-10-05T10:00:00Z",
        salvo_por_email: "",
      },
    ]);
    expect(h.map((x) => x.versao)).toEqual([2, 1]);
    expect(h[0]).toEqual({
      versao: 2,
      texto: texto(2),
      art: "ART 2",
      salvoEm: "2026-10-05T10:00:00Z",
      salvoPor: null,
    });
    expect(h[1].salvoPor).toBe("rt@exemplo.test");
    expect(historicoDeVersoes(null)).toEqual([]);
  });
});
