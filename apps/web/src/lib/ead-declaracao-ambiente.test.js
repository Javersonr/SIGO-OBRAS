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
  conflitoDeEdicao,
  igualAoVigente,
  mensagemDeConflitoDeEdicao,
  normalizarDeclaracao,
  proximaVersaoDaDeclaracao,
  tamanhoDoTexto,
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

describe("contar e aparar como o banco (A6, T35)", () => {
  it("o tamanho é em caracteres (char_length), não em unidades UTF-16", () => {
    expect(tamanhoDoTexto("😀".repeat(10))).toBe(10);
    expect(tamanhoDoTexto("ação")).toBe(4);
    expect(tamanhoDoTexto(null)).toBe(0);
    expect(validarDeclaracaoDoRT({ texto: "😀".repeat(10) }).ok).toBe(false);
    expect(validarDeclaracaoDoRT({ texto: "😀".repeat(3000) }).ok).toBe(true);
    const longo = validarDeclaracaoDoRT({ texto: "😀".repeat(4001) });
    expect(longo.erros.texto).toContain("tem 4001");
    expect(validarDeclaracaoDoRT({ texto: texto(1), art: "😀".repeat(120) }).ok).toBe(true);
    expect(
      validarDeclaracaoDoRT({ texto: texto(1), art: "😀".repeat(121) }).erros.art
    ).toBeTruthy();
  });

  it("apara só o que o btrim do banco apara (espaço, tab, CR, LF, FF e VT)", () => {
    expect(normalizarDeclaracao({ texto: " \t\r\n\f\vabc\n ", art: " \n " })).toEqual({
      texto: "abc",
      art: null,
    });
    // espaço sem quebra e BOM ficam, como no banco
    expect(normalizarDeclaracao({ texto: "\u00a0abc\ufeff" }).texto).toBe("\u00a0abc\ufeff");
  });
});

describe("dois RTs editando a partir da mesma versão (A6, T35)", () => {
  const linhas = [
    { versao: 1, texto: texto(1), art: null, salvo_por_email: "rt1@exemplo.test" },
    {
      versao: 2,
      texto: texto(2),
      art: "ART 2",
      salvo_por_email: "rt2@exemplo.test",
      created_at: "2026-10-07T14:05:00Z",
    },
  ];

  it("a janela abriu na versão 1 e a 2 já foi salva: é conflito, com quem salvou e quando", () => {
    expect(conflitoDeEdicao(1, linhas)).toEqual({
      versao: 2,
      salvoPor: "rt2@exemplo.test",
      salvoEm: "2026-10-07T14:05:00Z",
    });
  });

  it("sem versão nova (a da tela é a vigente) ou com a tela mais nova que a lida: não é conflito", () => {
    expect(conflitoDeEdicao(2, linhas)).toBeNull();
    expect(conflitoDeEdicao(3, linhas)).toBeNull();
    expect(conflitoDeEdicao(0, [])).toBeNull();
    expect(conflitoDeEdicao(0, null)).toBeNull();
  });

  it("a janela aberta no texto padrão (versão 0) e outra pessoa aprovou a versão 1: é conflito", () => {
    expect(conflitoDeEdicao(0, [linhas[0]])).toMatchObject({ versao: 1 });
  });

  it("linha estragada não conta como versão nova", () => {
    expect(conflitoDeEdicao(2, [...linhas, { versao: 3, texto: "curto" }])).toBeNull();
  });

  it("a mensagem diz quem, quando (hora de Brasília), a versão e que nada foi salvo", () => {
    const msg = mensagemDeConflitoDeEdicao(conflitoDeEdicao(1, linhas));
    expect(msg).toContain("rt2@exemplo.test");
    expect(msg).toContain("07/10/2026 11:05");
    expect(msg).toContain("versão 2");
    expect(msg).toMatch(/nada foi salvo/i);
    // sem autor nem hora gravados, a frase continua inteira
    const sem = mensagemDeConflitoDeEdicao({ versao: 4, salvoPor: null, salvoEm: null });
    expect(sem).toContain("outra pessoa");
    expect(sem).toContain("versão 4");
    expect(sem).not.toMatch(/undefined|null|Invalid/);
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
