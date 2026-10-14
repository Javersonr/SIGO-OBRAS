import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Guardas de contrato do CursoPortal (A4). O Vitest do projeto roda sem DOM: os efeitos (player do
// YouTube, envio de progresso) não executam em teste, então o que dá para travar é o texto do componente.
// A lógica de verdade fica em `lib/` com teste de comportamento (portal-video.test.js e
// portal-curso.test.js); aqui só se confere que o componente a USA, para ninguém desligar sem perceber.
const fonte = readFileSync(fileURLToPath(new URL("CursoPortal.jsx", import.meta.url)), "utf8");

/** Do início de `inicio` até o fecho `\n  };` ou `\n  }, [` mais próximo (a função/efeito inteiro). */
function trecho(inicio, fim) {
  const a = fonte.indexOf(inicio);
  expect(a, `não achei: ${inicio}`).toBeGreaterThan(-1);
  const b = fonte.indexOf(fim, a);
  expect(b, `não achei o fim: ${fim}`).toBeGreaterThan(a);
  return fonte.slice(a, b);
}

describe("player do YouTube: 'Carregando vídeo...' (A1, m2 e m5)", () => {
  const efeito = trecho("// YouTube: monta o player", "}, [aula?.id, modo, tentativaVideo]);");
  const limpeza = efeito.slice(efeito.indexOf("return () => {"));

  it("a limpeza do efeito zera o `ytPronto`: o player novo, com a mesma chave, mostra o carregando de novo", () => {
    expect(limpeza).toContain('setYtPronto("")');
    // e antes de destruir o player (a ordem não muda o efeito, mas some o risco de um onReady tardio)
    expect(limpeza.indexOf('setYtPronto("")')).toBeLessThan(limpeza.indexOf("destroy"));
  });

  it("o carregando tem tempo limite: vigia criado com a falha 'Tentar de novo', desarmado ao ficar pronto, falhar ou sair", () => {
    expect(efeito).toContain("criarVigiaDoPlayer({");
    expect(efeito).toMatch(/mensagem: MSG_PLAYER_DEMOROU, acao: "tentar"/);
    // o disparo de um player que já saiu de cena não mostra falha
    expect(efeito).toMatch(/aoEstourar: \(\) => \{\s*if \(!vivo\) return;/);
    const onReady = /onReady: \(\) => \{([\s\S]*?)\n {12}\},/.exec(efeito)?.[1] ?? "";
    expect(onReady).toContain("vigia?.parar()");
    const onError = /onError: \(ev\) => \{([\s\S]*?)\n {12}\},/.exec(efeito)?.[1] ?? "";
    expect(onError).toContain("vigia?.parar()");
    expect(limpeza).toContain("vigia?.parar()");
  });

  it("o vigia só começa depois de o player ser criado (o script já tem o próprio tempo limite)", () => {
    expect(efeito.indexOf("criarVigiaDoPlayer({")).toBeGreaterThan(efeito.indexOf("new YT.Player"));
  });
});

describe("aviso de 409/429 que some no próximo envio certo (T31, M2)", () => {
  it("o erro do envio de progresso e do evento guarda o texto passageiro, e o sucesso o tira", () => {
    const sincronizar = trecho(
      "const sincronizar = async",
      "// tempo de tela das aulas sem player"
    );
    expect(sincronizar).toMatch(/envioDeuCerto\(\);\s*\/\/ o servidor é quem manda/);
    expect(sincronizar).toContain("tratarErroDeEnvio(e)");
    const evento = trecho("const evento = (nome", "// `fim`: o vídeo acabou");
    expect(evento).toContain(".then(");
    expect(evento).toContain("envioDeuCerto()");
    expect(evento).toContain(".catch(tratarErroDeEnvio)");
    const abrirAula = trecho("const abrirAula = async", "// O arquivo do vídeo não carregou");
    expect(abrirAula).toMatch(
      /envioDeuCerto\(\);\s*\} catch \(e\) \{[\s\S]*tratarErroDeEnvio\(e\)/
    );
  });

  it("só tira o aviso que ainda está na tela (outro erro lido pelo aluno fica)", () => {
    const sucesso = trecho("const envioDeuCerto = () => {", "// Busca os dados de novo.");
    expect(sucesso).toContain("setErro((atual) => erroAposEnvioCerto(atual, aviso))");
    const erroDeEnvio = trecho("const tratarErroDeEnvio = (e) => {", "const envioDeuCerto");
    expect(erroDeEnvio).toContain("textoDoAvisoPassageiro(e)");
  });
});

describe("leitura até o fim, sem relógio (A5)", () => {
  it("o botão de concluir a leitura vem de botaoDeLeitura e só acende com o fim alcançado", () => {
    expect(fonte).toContain("botaoDeLeitura({");
    expect(fonte).toContain("chegouAoFim: fimAlcancado[aula.id] === true");
    expect(fonte).toMatch(/disabled=\{!botaoLeitura\.habilitado\}/);
  });

  it("não sobrou contagem regressiva nem o 409 de tempo de leitura", () => {
    expect(fonte).not.toMatch(/faltam \$\{fmtTempo/);
    expect(fonte).not.toContain("segundosTela < minimo");
    expect(fonte).not.toContain("TEMPO_LEITURA");
  });

  it("texto e tarefa têm o marcador de fim; a apostila avisa o fim pelo onFim", () => {
    expect(fonte).toMatch(/<MarcadorDeFim[\s\S]*?onVisivel=\{\(\) => marcarFim\(aula\.id\)\}/);
    expect(fonte).toMatch(/onFim=\{\(\) => marcarFim\(aula\.id\)\}/);
  });
});

describe("a aula aberta começa no topo, antes de o marcador do fim ser observado (A5)", () => {
  // O painel da aula e a lista de aulas ficam empilhados: sem levar o painel ao topo, o marcador do fim da
  // aula nova (raiz = janela) pode já estar à vista na montagem e acenderia o botão sem leitura.
  // O fim do trecho é o array de dependências: só a chave da aula aberta (dados refeitos no meio da
  // leitura não rolam a página de novo), e a regra da chave tem teste em lib/portal-leitura.test.js.
  const rolagem = () => trecho("useLayoutEffect(() => {", "}, [chavePainel]);");

  it("o painel da aula sobe ao topo da janela quando a aula aberta muda, sem animação", () => {
    const efeito = rolagem();
    expect(fonte).toContain("const chavePainel = chaveDoPainelDaAula({ aulaId, modo });");
    expect(efeito).toContain("if (!chavePainel) return;");
    expect(efeito).toContain("painelAulaRef.current");
    expect(efeito).toContain("scrollIntoView(");
    expect(efeito).toContain('block: "start"');
    // "smooth" (ou o scroll-behavior do CSS) deixaria o marcador ser medido antes de a rolagem acabar
    expect(efeito).toContain('behavior: "instant"');
    expect(efeito).not.toContain("smooth");
    expect(fonte).toMatch(/<div ref=\{painelAulaRef\} className="space-y-2">/);
  });

  it("a rolagem é um efeito de layout; o marcador observa num efeito comum, que roda depois de todos os de layout", () => {
    expect(fonte).toMatch(/import React, \{[^}]*useLayoutEffect[^}]*\} from "react";/);
    const marcador = trecho("function MarcadorDeFim(", "/** Tarefa de estudo");
    expect(marcador).toContain("useEffect(() => {");
    expect(marcador).not.toContain("useLayoutEffect");
  });
});

describe("ApostilaPdf: o pdf.js desenha a apostila em todas as telas (A5)", () => {
  const apostila = readFileSync(fileURLToPath(new URL("ApostilaPdf.jsx", import.meta.url)), "utf8");

  it("não usa mais o iframe do navegador nem a consulta de mídia do celular", () => {
    expect(apostila).not.toContain("<iframe");
    expect(apostila).not.toContain("apostilaNaPagina");
  });

  it("a apostila indisponível não fala de tempo de leitura (não há mais relógio)", () => {
    expect(apostila).not.toContain("tempo de leitura");
    expect(apostila).toContain("Apostila indisponível — avise o RH");
  });

  it("o fim só vale com o documento aberto e medido, e é avisado uma vez só", () => {
    expect(apostila).toContain("fimDaApostilaAlcancado({");
    expect(apostila).toMatch(
      /if \(fimAvisadoRef\.current\) return;\s*fimAvisadoRef\.current = true;/
    );
  });
});

describe("questionário do módulo (A2)", () => {
  it("o CursoPortal abre o QuestionarioPortal com a API injetada; a conclusão vem da ação própria", () => {
    expect(fonte).toMatch(
      /aula\.tipo === "questionario" && \(\s*<QuestionarioPortal[\s\S]*?api=\{api\}[\s\S]*?onConcluida=\{aoConcluirAtividade\}/
    );
    const conclusao = trecho("const aoConcluirAtividade = async", "\n  };");
    expect(conclusao).toMatch(/if \(previa\) \{\s*setAviso\(MSG_PREVIA_CONCLUSAO\);\s*return;/);
    // o progresso que vai junto só leva o tempo de tela: quem conclui é a ação do questionário/caso
    expect(conclusao).not.toContain("concluir:");
    expect(conclusao).toContain("avisoDeAulaConcluida({");
  });
});

describe("caso com decisões (A3)", () => {
  it("o CursoPortal abre o CasoPortal com a API injetada e conclui pela mesma rotina do questionário", () => {
    expect(fonte).toMatch(
      /aula\.tipo === "caso" && \(\s*<CasoPortal[\s\S]*?api=\{api\}[\s\S]*?onConcluida=\{aoConcluirAtividade\}/
    );
  });
});
