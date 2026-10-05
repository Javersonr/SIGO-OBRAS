import { describe, it, expect } from "vitest";
import { conclusaoDaAula } from "../../../../supabase/functions/portal-funcionario/regras.ts";
import {
  PCT_MINIMO_VIDEO,
  IDADE_MAX_DADOS_MS,
  JANELA_RENOVACAO_AUTO_MS,
  AVISO_VELOCIDADE,
  MSG_VIDEO_RENOVADO,
  avisoRetomada,
  avisoPedePlay,
  minimoVideoSeg,
  percentualContado,
  precisaReassistir,
  rotuloProgressoVideo,
  avisoFimIncompleto,
  velocidadeNormal,
  dadosPrecisamRenovar,
  renovacaoAutomaticaPermitida,
  aulaDoCurso,
  fonteDoVideo,
  mensagemVideoIndisponivel,
  mensagemErroYouTube,
  criarCarregadorYouTube,
} from "./portal-video";

const URL_OK = "https://exemplo.test/storage/aula.mp4?token=abc";

describe("minimoVideoSeg (mesma regra de conclusaoDaAula, no servidor)", () => {
  it("é 90% da duração arredondado para cima", () => {
    expect(PCT_MINIMO_VIDEO).toBe(0.9);
    expect(minimoVideoSeg(100)).toBe(90);
    expect(minimoVideoSeg(180)).toBe(162);
    expect(minimoVideoSeg(101)).toBe(Math.ceil(101 * 0.9)); // 91
    expect(minimoVideoSeg(1)).toBe(1);
    expect(minimoVideoSeg(7)).toBe(7); // 6,3 sobe para 7
  });

  it("é o mesmo mínimo que o servidor usa para concluir a aula (conclusaoDaAula)", () => {
    for (const duracao of [1, 2, 7, 10, 33, 59, 100, 101, 180, 599, 1000, 3601, 7200]) {
      const servidor = conclusaoDaAula({ tipo: "video", duracao, segundos: 0 }).minimoSeg;
      expect(minimoVideoSeg(duracao)).toBe(servidor);
      // no mínimo exato o servidor conclui; um segundo antes, não
      expect(conclusaoDaAula({ tipo: "video", duracao, segundos: servidor }).concluiu).toBe(true);
      expect(precisaReassistir({ segundos: servidor, duracao })).toBe(false);
      if (servidor > 0) {
        expect(conclusaoDaAula({ tipo: "video", duracao, segundos: servidor - 1 }).concluiu).toBe(
          false
        );
        expect(precisaReassistir({ segundos: servidor - 1, duracao })).toBe(true);
      }
    }
  });

  it("sem duração válida não há mínimo", () => {
    for (const ruim of [0, -5, null, undefined, "", "abc", NaN, Infinity]) {
      expect(minimoVideoSeg(ruim)).toBe(0);
    }
  });
});

describe("percentualContado", () => {
  it("é o percentual da duração, sempre para baixo", () => {
    expect(percentualContado(90, 180)).toBe(50);
    expect(percentualContado(120, 180)).toBe(66); // 66,7% não vira 67%
    expect(percentualContado(0, 180)).toBe(0);
    expect(percentualContado(180, 180)).toBe(100);
  });

  it("nunca passa de 100 nem fica negativo, e sem duração é zero", () => {
    expect(percentualContado(500, 180)).toBe(100);
    expect(percentualContado(-3, 180)).toBe(0);
    expect(percentualContado(50, 0)).toBe(0);
    expect(percentualContado(50, null)).toBe(0);
    expect(percentualContado(undefined, 180)).toBe(0);
  });

  it("abaixo do mínimo nunca mostra 90% ou mais", () => {
    for (const duracao of [10, 33, 100, 181, 1000, 9999]) {
      const abaixo = minimoVideoSeg(duracao) - 1;
      expect(percentualContado(abaixo, duracao)).toBeLessThan(90);
    }
  });
});

describe("precisaReassistir (fim do vídeo com tempo contado a menos)", () => {
  it("assistiu a 2x contando em tempo real: 50% e 67% contados", () => {
    expect(precisaReassistir({ segundos: 90, duracao: 180 })).toBe(true); // 2x
    expect(precisaReassistir({ segundos: 120, duracao: 180 })).toBe(true); // 1,5x
  });

  it("no mínimo exato ou acima, não precisa", () => {
    expect(precisaReassistir({ segundos: 162, duracao: 180 })).toBe(false);
    expect(precisaReassistir({ segundos: 161, duracao: 180 })).toBe(true);
    expect(precisaReassistir({ segundos: 180, duracao: 180 })).toBe(false);
  });

  it("sem duração cadastrada não há o que reassistir (o aviso é outro)", () => {
    expect(precisaReassistir({ segundos: 10, duracao: null })).toBe(false);
    expect(precisaReassistir({ segundos: 10, duracao: 0 })).toBe(false);
  });
});

describe("rotuloProgressoVideo", () => {
  it('mostra "X de Y (mínimo Z)" com o mínimo de 90%', () => {
    expect(rotuloProgressoVideo({ segundos: 65, duracao: 180 })).toBe("1:05 de 3:00 (mínimo 2:42)");
  });

  it("o assistido não passa da duração", () => {
    expect(rotuloProgressoVideo({ segundos: 400, duracao: 180 })).toBe(
      "3:00 de 3:00 (mínimo 2:42)"
    );
  });

  it("segundos quebrados caem para baixo e valores ruins viram 0:00", () => {
    expect(rotuloProgressoVideo({ segundos: 59.9, duracao: 120 })).toBe(
      "0:59 de 2:00 (mínimo 1:48)"
    );
    expect(rotuloProgressoVideo({ segundos: undefined, duracao: 120 })).toBe(
      "0:00 de 2:00 (mínimo 1:48)"
    );
  });

  it("sem duração, só o assistido", () => {
    expect(rotuloProgressoVideo({ segundos: 30, duracao: null })).toBe("0:30");
  });
});

describe("avisoFimIncompleto", () => {
  it("diz quanto foi contado, o mínimo e o que fazer", () => {
    const texto = avisoFimIncompleto({ segundos: 90, duracao: 180 });
    expect(texto).toContain("só 50%");
    expect(texto).toContain("90%");
    expect(texto).toContain("Assistir de novo");
  });

  it("explica a causa provável (velocidade e saltos)", () => {
    expect(avisoFimIncompleto({ segundos: 120, duracao: 180 })).toMatch(/velocidade|pul/i);
  });
});

describe("velocidadeNormal", () => {
  it("só 1x vale", () => {
    expect(velocidadeNormal(1)).toBe(true);
    for (const taxa of [0.5, 0.75, 1.25, 1.5, 2, 16, 0, NaN, undefined]) {
      expect(velocidadeNormal(taxa)).toBe(false);
    }
  });

  it("o aviso fala em 1x", () => {
    expect(AVISO_VELOCIDADE).toContain("1x");
  });
});

describe("dadosPrecisamRenovar (URLs assinadas valem 3 h; renova com 2h30)", () => {
  const agora = Date.UTC(2026, 9, 5, 15, 0, 0);

  it("o limite é 2 h 30", () => {
    expect(IDADE_MAX_DADOS_MS).toBe(150 * 60 * 1000);
  });

  it("dados recentes não renovam", () => {
    expect(dadosPrecisamRenovar(agora, agora)).toBe(false);
    expect(dadosPrecisamRenovar(agora - 60 * 60 * 1000, agora)).toBe(false);
  });

  it("exatamente 2h30 ainda vale; passou disso, renova", () => {
    expect(dadosPrecisamRenovar(agora - IDADE_MAX_DADOS_MS, agora)).toBe(false);
    expect(dadosPrecisamRenovar(agora - IDADE_MAX_DADOS_MS - 1, agora)).toBe(true);
    expect(dadosPrecisamRenovar(agora - 4 * 60 * 60 * 1000, agora)).toBe(true);
  });

  it("não sabe quando carregou: renova por segurança", () => {
    for (const desconhecido of [0, null, undefined, NaN, "ontem"]) {
      expect(dadosPrecisamRenovar(desconhecido, agora)).toBe(true);
    }
  });

  it("relógio do aparelho voltou (carregou 'no futuro'): não renova", () => {
    expect(dadosPrecisamRenovar(agora + 60_000, agora)).toBe(false);
  });
});

describe("renovacaoAutomaticaPermitida (uma renovação por vez, sem laço de erro)", () => {
  const agora = 1_000_000_000;

  it("nunca renovou: pode", () => {
    expect(renovacaoAutomaticaPermitida(undefined, agora)).toBe(true);
    expect(renovacaoAutomaticaPermitida(0, agora)).toBe(true);
  });

  it("renovou há pouco: não repete sozinho (mostra a mensagem)", () => {
    expect(renovacaoAutomaticaPermitida(agora - 1000, agora)).toBe(false);
    expect(renovacaoAutomaticaPermitida(agora - JANELA_RENOVACAO_AUTO_MS + 1, agora)).toBe(false);
  });

  it("passada a janela, pode de novo", () => {
    expect(renovacaoAutomaticaPermitida(agora - JANELA_RENOVACAO_AUTO_MS, agora)).toBe(true);
  });
});

describe("aulaDoCurso", () => {
  const dados = {
    cursos: [
      { matricula: { id: "m1" }, aulas: [{ id: "a1", video_url: "u1" }] },
      { matricula: { id: "m2" }, aulas: [{ id: "a1", video_url: "outra" }, { id: "a2" }] },
    ],
  };

  it("acha a aula pela matrícula e pelo id", () => {
    expect(aulaDoCurso(dados, "m2", "a1")?.video_url).toBe("outra");
    expect(aulaDoCurso(dados, "m1", "a1")?.video_url).toBe("u1");
  });

  it("devolve null quando não acha ou os dados não vieram", () => {
    expect(aulaDoCurso(dados, "m3", "a1")).toBeNull();
    expect(aulaDoCurso(dados, "m1", "a9")).toBeNull();
    expect(aulaDoCurso(null, "m1", "a1")).toBeNull();
    expect(aulaDoCurso({}, "m1", "a1")).toBeNull();
    expect(aulaDoCurso({ cursos: [{ matricula: { id: "m1" } }] }, "m1", "a1")).toBeNull();
  });
});

describe("fonteDoVideo", () => {
  it("upload com URL válida toca o arquivo", () => {
    expect(fonteDoVideo({ fonte: "upload", video_url: URL_OK })).toBe("upload");
  });

  it("upload sem URL (nula, vazia, about:blank, relativa) é indisponível", () => {
    for (const ruim of [
      null,
      undefined,
      "",
      "   ",
      "about:blank",
      "/aula.mp4",
      "javascript:alert(1)",
    ]) {
      expect(fonteDoVideo({ fonte: "upload", video_url: ruim })).toBe("indisponivel");
    }
  });

  it("não cai no bloco do YouTube quando é upload, mesmo com youtube_id preenchido", () => {
    expect(fonteDoVideo({ fonte: "upload", video_url: null, youtube_id: "abc123" })).toBe(
      "indisponivel"
    );
  });

  it("YouTube com id toca o player do YouTube", () => {
    expect(fonteDoVideo({ fonte: "youtube", youtube_id: "dQw4w9WgXcQ" })).toBe("youtube");
    expect(fonteDoVideo({ youtube_id: "dQw4w9WgXcQ" })).toBe("youtube"); // fonte vazia = youtube
  });

  it("YouTube sem id é indisponível", () => {
    for (const ruim of [null, undefined, "", "  "]) {
      expect(fonteDoVideo({ fonte: "youtube", youtube_id: ruim })).toBe("indisponivel");
    }
    expect(fonteDoVideo(null)).toBe("indisponivel");
  });
});

describe("mensagemVideoIndisponivel", () => {
  it('pede para avisar o RH, com "Arquivo indisponível" quando é upload', () => {
    expect(mensagemVideoIndisponivel({ fonte: "upload" })).toBe(
      "Arquivo indisponível — avise o RH"
    );
    expect(mensagemVideoIndisponivel({ fonte: "youtube" })).toMatch(/avise o RH/);
  });
});

describe("mensagemErroYouTube", () => {
  it("cada código do player tem texto próprio e todos mandam avisar o RH quando não adianta tentar", () => {
    expect(mensagemErroYouTube(100)).toMatch(/removido|privado/);
    expect(mensagemErroYouTube(101)).toMatch(/não permite/);
    expect(mensagemErroYouTube(150)).toBe(mensagemErroYouTube(101));
    expect(mensagemErroYouTube(2)).toMatch(/inválido/);
  });

  it("código desconhecido ou nulo: mensagem genérica, nunca vazia", () => {
    for (const codigo of [5, 0, undefined, null, "x", 999]) {
      expect(mensagemErroYouTube(codigo).length).toBeGreaterThan(10);
    }
  });
});

describe("criarCarregadorYouTube", () => {
  function ambiente() {
    const anexados = [];
    const agendados = []; // { id, fn, ms }
    const cancelados = []; // ids dos temporizadores cancelados
    const documento = {
      head: {
        appendChild: (el) => {
          anexados.push(el);
          el.parentNode = documento.head;
        },
        removeChild: (el) => {
          el.parentNode = null;
          anexados.splice(anexados.indexOf(el), 1);
        },
      },
      createElement: () => ({}),
    };
    const janela = {};
    const carregar = criarCarregadorYouTube({
      janela,
      documento,
      agendar: (fn, ms) => {
        const id = agendados.length + 1;
        agendados.push({ id, fn, ms });
        return id;
      },
      cancelar: (id) => cancelados.push(id),
      timeoutMs: 5000,
    });
    // o YouTube terminou de carregar: define o YT e chama o callback que o carregador registrou
    const youtubePronto = () => {
      janela.YT = { Player: function Player() {} };
      janela.onYouTubeIframeAPIReady();
    };
    return { anexados, agendados, cancelados, janela, carregar, youtubePronto };
  }

  it("já carregada: devolve o YT sem criar script nem temporizador", async () => {
    const { anexados, agendados, janela, carregar } = ambiente();
    janela.YT = { Player: function Player() {} };
    await expect(carregar()).resolves.toBe(janela.YT);
    expect(anexados).toHaveLength(0);
    expect(agendados).toHaveLength(0);
  });

  it("carrega o script uma vez só e resolve quando o YouTube avisa que está pronto", async () => {
    const { anexados, janela, carregar, youtubePronto } = ambiente();
    const p1 = carregar();
    const p2 = carregar();
    expect(p2).toBe(p1);
    expect(anexados).toHaveLength(1);
    expect(anexados[0].src).toBe("https://www.youtube.com/iframe_api");
    youtubePronto();
    await expect(p1).resolves.toBe(janela.YT);
  });

  it("mantém o callback que já existia na página", async () => {
    const { janela, carregar, youtubePronto } = ambiente();
    let chamou = 0;
    janela.onYouTubeIframeAPIReady = () => {
      chamou += 1;
    };
    const p = carregar();
    youtubePronto();
    await p;
    expect(chamou).toBe(1);
  });

  it("script.onerror rejeita com mensagem, cancela o temporizador e deixa tentar de novo", async () => {
    const { anexados, agendados, cancelados, carregar } = ambiente();
    const p = carregar();
    anexados[0].onerror(new Event("error"));
    await expect(p).rejects.toThrow(/YouTube/);
    expect(anexados).toHaveLength(0); // o script que falhou saiu da página
    expect(cancelados).toEqual([agendados[0].id]); // o temporizador do tempo limite não fica solto

    const outra = carregar(); // nova tentativa = novo script
    expect(anexados).toHaveLength(1);
    expect(outra).not.toBe(p);
  });

  it("sem resposta no tempo limite rejeita com mensagem e tira o script da página", async () => {
    const { anexados, agendados, carregar } = ambiente();
    const p = carregar();
    expect(agendados).toHaveLength(1);
    expect(agendados[0].ms).toBe(5000);
    expect(anexados).toHaveLength(1);
    agendados[0].fn();
    await expect(p).rejects.toThrow(/YouTube/);
    expect(anexados).toHaveLength(0);
  });

  it("no sucesso o temporizador do tempo limite é CANCELADO (e só ele, uma vez)", async () => {
    const { agendados, cancelados, carregar, youtubePronto } = ambiente();
    const p = carregar();
    expect(agendados).toHaveLength(1);
    expect(cancelados).toEqual([]); // ainda carregando: nada cancelado
    youtubePronto();
    await p;
    expect(cancelados).toEqual([agendados[0].id]);
    // o YouTube costuma chamar o callback mais de uma vez: não cancela nem resolve de novo
    youtubePronto();
    expect(cancelados).toEqual([agendados[0].id]);
  });

  it("o tempo limite que dispara DEPOIS do sucesso não rejeita nem tira o script da página", async () => {
    const { anexados, agendados, janela, carregar, youtubePronto } = ambiente();
    const p = carregar();
    youtubePronto();
    await expect(p).resolves.toBe(janela.YT);
    agendados[0].fn(); // um temporizador que escapou do cancelamento
    expect(anexados).toHaveLength(1); // o script que funcionou continua na página
    await expect(p).resolves.toBe(janela.YT); // e a promessa continua resolvida
    await expect(carregar()).resolves.toBe(janela.YT); // quem pedir depois recebe o YT pronto
    expect(anexados).toHaveLength(1);
  });

  it("falha por script.onerror DEPOIS do sucesso não derruba nada", async () => {
    const { anexados, cancelados, janela, carregar, youtubePronto } = ambiente();
    const p = carregar();
    youtubePronto();
    await p;
    expect(() => anexados[0].onerror()).not.toThrow();
    expect(anexados).toHaveLength(1);
    expect(cancelados).toHaveLength(1);
    await expect(carregar()).resolves.toBe(janela.YT);
  });

  it("depois do tempo limite há NOVA tentativa: novo script, novo temporizador, e ela pode dar certo", async () => {
    const { anexados, agendados, janela, carregar, youtubePronto } = ambiente();
    const primeira = carregar();
    const scriptDaPrimeira = anexados[0];
    agendados[0].fn();
    await expect(primeira).rejects.toThrow(/YouTube/);
    expect(anexados).toHaveLength(0);

    const segunda = carregar();
    expect(segunda).not.toBe(primeira);
    expect(anexados).toHaveLength(1);
    expect(anexados[0]).not.toBe(scriptDaPrimeira);
    expect(anexados[0].src).toBe("https://www.youtube.com/iframe_api");
    expect(agendados).toHaveLength(2); // a nova tentativa tem o seu próprio tempo limite
    expect(agendados[1].ms).toBe(5000);

    youtubePronto();
    await expect(segunda).resolves.toBe(janela.YT);
    // o tempo limite da 1ª tentativa e o erro do script antigo chegam tarde e não afetam a 2ª
    agendados[0].fn();
    scriptDaPrimeira.onerror?.();
    expect(anexados).toHaveLength(1);
    await expect(segunda).resolves.toBe(janela.YT);
  });

  it("o erro tardio do script da tentativa antiga não derruba a nova tentativa em andamento", async () => {
    const { anexados, agendados, janela, carregar, youtubePronto } = ambiente();
    const primeira = carregar();
    const scriptDaPrimeira = anexados[0];
    agendados[0].fn();
    await expect(primeira).rejects.toThrow(/YouTube/);

    const segunda = carregar();
    scriptDaPrimeira.onerror(); // chega tarde, com a 2ª ainda carregando
    expect(anexados).toHaveLength(1); // o script novo continua lá
    youtubePronto();
    await expect(segunda).resolves.toBe(janela.YT);
  });
});

describe("avisos que pedem o play (retomada e link renovado)", () => {
  it("o texto de retomada diz o ponto e manda apertar o play", () => {
    const texto = avisoRetomada(754);
    expect(texto).toContain("12:34");
    expect(texto).toMatch(/Aperte o play/);
  });

  it("os dois avisos que pedem o play são reconhecidos (e somem quando o aluno dá o play)", () => {
    expect(avisoPedePlay(avisoRetomada(754))).toBe(true);
    expect(avisoPedePlay(avisoRetomada(5))).toBe(true);
    expect(avisoPedePlay(MSG_VIDEO_RENOVADO)).toBe(true);
    expect(MSG_VIDEO_RENOVADO).toMatch(/Aperte o play/);
  });

  it("qualquer outro aviso fica (velocidade, aula concluída, erro de leitura...)", () => {
    for (const outro of [
      AVISO_VELOCIDADE,
      "✅ Aula concluída — a próxima já está liberada.",
      "🎉 Curso concluído!",
      "Retomamos o vídeo",
      "",
      null,
      undefined,
    ]) {
      expect(avisoPedePlay(outro)).toBe(false);
    }
  });
});
