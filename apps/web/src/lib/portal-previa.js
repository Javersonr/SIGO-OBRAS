/**
 * Prévia do curso para o responsável técnico ("Ver como aluno", T28) — regras puras, sem DOM e sem rede.
 *
 * O RT revisa vídeos, questões e gabarito exatamente como o aluno vê, mas sem matricular ninguém: os
 * componentes do portal (CursoPortal, AvaliacaoPortal, DuvidasPortal, CertificadoPortal) recebem uma API
 * injetada (`api.chamarPortal`) e, aqui, ela é uma API de mentira que NUNCA fala com o servidor. Assim a
 * prévia não grava trilha, tentativa, progresso, dúvida nem certificado.
 *
 * - `refsDaPrevia`: quais arquivos (referências "bucket/caminho") a tela do RH precisa assinar;
 * - `montarItemPrevia`: o "item" do curso no formato da ação `dados` do portal, mas com todas as aulas
 *   liberadas e as questões da prova COM gabarito e comentário (só o RT vê); as questões dos questionários e os
 *   roteiros dos casos ficam em `atividades_previa`, que só a prévia tem;
 * - `sortearPrevia`: o sorteio da prova, no formato da ação `iniciar_avaliacao` do servidor (a prova
 *   deixou de ser sorteada no navegador do aluno, T16; aqui o sorteio é local porque a prévia não fala
 *   com o servidor);
 * - `corrigirPrevia`: correção da prova, a mesma conta de `corrigirProva` (portal-funcionario/regras.ts);
 * - `criarApiPrevia`: a API injetada (também o questionário e o caso, com as regras de lib/ead-caso.js).
 *
 * As URLs assinadas chegam prontas (`urls`): a tela do RH as resolve com `resolveStorageUrl`; esta lib
 * não importa `@/api/sigoClient`. Testes em portal-previa.test.js.
 */

import { MAX_DEDICACAO_MIN, MAX_PRAZO_DIAS } from "./ead-projeto";
import { estadoDoCaso, etapaParaAluno, resultadoDaEscolha } from "./ead-caso";

/** Id da matrícula de mentira da prévia: não existe no banco. */
export const ID_MATRICULA_PREVIA = "previa";

/** Mesmos padrões do servidor (portal-funcionario/index.ts, regras.ts e questionario.ts). */
const NOTA_MINIMA_PADRAO = 70;
const NOTA_MINIMA_MODULO_PADRAO = 80;
const TEMPO_MINIMO_PADRAO = 60; // aula de PDF/texto sem tempo definido
/**
 * Espelha REPROVADO_VE_NOTA do servidor (regras.ts, D10 decidida em 06/10/2026): `false` = o reprovado
 * recebe só "insatisfatório" (sem nota, acertos nem total, que deixariam deduzir o gabarito); `true` =
 * comportamento de antes da T16. Trocar um lado exige trocar o outro.
 */
const REPROVADO_VE_NOTA = false;

/**
 * Nota mínima como o servidor a usa (`nota_minima ?? 70`): só ausente (ou o texto vazio do formulário)
 * cai no padrão. 0 vale 0: o RT vê a prova passar com qualquer nota, como o aluno veria.
 */
function notaMinimaDe(valor) {
  if (valor === null || valor === undefined) return NOTA_MINIMA_PADRAO;
  if (typeof valor === "string" && valor.trim() === "") return NOTA_MINIMA_PADRAO;
  const n = Number(valor);
  return Number.isFinite(n) ? n : NOTA_MINIMA_PADRAO;
}

/**
 * Nota mínima dos questionários dos módulos, como o servidor (`notaMinimaDoModulo`, regras.ts): inteiro de 0 a
 * 100; ausente ou inválido vale 80. O formulário do RH pode mandar texto ("85"), mas só número ou texto
 * preenchido conta (`true`, lista e objeto caem no padrão).
 */
function notaMinimaDoModulo(valor) {
  const aceito = typeof valor === "number" || (typeof valor === "string" && valor.trim() !== "");
  if (!aceito) return NOTA_MINIMA_MODULO_PADRAO;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : NOTA_MINIMA_MODULO_PADRAO;
}

/** O roteiro gravado (`treinamento_caso.conteudo`, jsonb): um objeto, ou o texto JSON de um objeto; senão null. */
function roteiroDoCaso(conteudo) {
  if (conteudo && typeof conteudo === "object" && !Array.isArray(conteudo)) return conteudo;
  if (typeof conteudo === "string") {
    try {
      const v = JSON.parse(conteudo);
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

const lista = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const porOrdem = (itens) => [...itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
const tipoDaAula = (a) => a?.tipo || "video";
const textoDe = (v) => (typeof v === "string" ? v : "");

/**
 * Referências de arquivo que o portal assinaria para este curso: vídeo só quando é arquivo próprio,
 * apostila só quando a aula é PDF, legenda e projeto pedagógico. Sem repetidas e sem vazias.
 */
export function refsDaPrevia({ curso, aulas } = {}) {
  const refs = [];
  for (const a of lista(aulas)) {
    const tipo = tipoDaAula(a);
    if (tipo === "video" && a.fonte === "upload") refs.push(a.video_ref);
    refs.push(a.legenda_ref);
    if (tipo === "pdf") refs.push(a.arquivo_ref);
  }
  refs.push(curso?.projeto_pedagogico_ref);
  return [...new Set(refs.filter((r) => typeof r === "string" && r))];
}

/** URL já assinada de uma referência (`urls` é um objeto ou um Map); sem URL = null. */
function urlDe(urls, ref) {
  if (!ref) return null;
  const url = urls instanceof Map ? urls.get(ref) : urls?.[ref];
  return typeof url === "string" && url ? url : null;
}

/** `opcoes` é jsonb: pode vir como lista, como texto JSON (legado) ou quebrado. */
function opcoesDaQuestao(opcoes) {
  if (Array.isArray(opcoes)) return opcoes;
  if (typeof opcoes === "string") {
    try {
      const v = JSON.parse(opcoes);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Nome e atendimento do tutor do curso, como o servidor devolve (tutor.ts); vazio vira null e o telefone fica de fora. */
function tutorParaAPrevia(curso) {
  const aparar = (valor) => String(valor ?? "").trim() || null;
  return {
    tutor_nome: aparar(curso?.tutor_nome),
    tutor_atendimento: aparar(curso?.tutor_atendimento),
  };
}

/**
 * Prazo para concluir e dedicação diária do projeto pedagógico (T25), como o servidor devolve em `dados`
 * (projeto.ts): inteiro válido ou null. O texto do projeto não vai ao aluno (só dentro do PDF).
 */
function projetoParaAPrevia(curso) {
  const inteiro = (valor, maximo) => {
    const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
    return Number.isInteger(n) && n >= 1 && n <= maximo ? n : null;
  };
  return {
    prazo_conclusao_dias: inteiro(curso?.prazo_conclusao_dias, MAX_PRAZO_DIAS),
    dedicacao_diaria_min: inteiro(curso?.dedicacao_diaria_min, MAX_DEDICACAO_MIN),
  };
}

/**
 * O "item" de um curso como o aluno o recebe do portal (ação `dados`), para a prévia do RT. Diferenças
 * propositais: matrícula de mentira, todas as aulas liberadas e nenhuma concluída, questões com
 * `correta` e `comentario`, sem certificado e sem dúvidas, curso sempre "publicado" (o selo de curso
 * despublicado é aviso para quem tem matrícula) e nenhuma tentativa usada. Não altera o que recebe.
 *
 * `questoes` são todas as do curso: as de `aula_id` vazio são a prova final (`item.questoes`); as outras são
 * dos questionários, por aula. `casos` são os roteiros (`[{ aula_id, conteudo }]`). Questões e roteiros dos
 * questionários e casos vão em `atividades_previa`, que o servidor nunca manda ao aluno: só a API da prévia
 * os usa (sorteio, correção e roteiro locais).
 */
export function montarItemPrevia({ curso, aulas, questoes, casos, urls } = {}) {
  const aulasPrevia = porOrdem(lista(aulas)).map((a) => {
    const tipo = tipoDaAula(a);
    return {
      id: a.id,
      ordem: a.ordem,
      modulo: a.modulo ?? null,
      tipo,
      titulo: a.titulo,
      fonte: a.fonte || "youtube",
      youtube_id: a.youtube_id ?? null,
      video_url: tipo === "video" && a.fonte === "upload" ? urlDe(urls, a.video_ref) : null,
      legenda_url: urlDe(urls, a.legenda_ref),
      arquivo_url: tipo === "pdf" ? urlDe(urls, a.arquivo_ref) : null,
      // texto e tarefa levam o texto da aula (a tarefa: instruções e o que produzir); questionário e caso
      // vêm das ações próprias, como no servidor
      conteudo_texto: tipo === "texto" || tipo === "tarefa" ? (a.conteudo_texto ?? null) : null,
      duracao_seg: a.duracao_seg || (tipo === "video" ? null : TEMPO_MINIMO_PADRAO),
      segundos_assistidos: 0,
      concluida: false,
      liberada: true,
    };
  });

  const paraAPrevia = (q) => ({
    id: q.id,
    curso_id: q.curso_id ?? curso?.id ?? null,
    ordem: q.ordem,
    pergunta: q.pergunta,
    opcoes: opcoesDaQuestao(q.opcoes),
    correta: q.correta,
    comentario: q.comentario ?? null,
  });
  const ativas = porOrdem(lista(questoes)).filter((q) => !q.deleted_at);
  // a prova final usa só as questões sem aula (`aula_id` vazio); as dos questionários ficam por aula
  const questoesPrevia = ativas.filter((q) => !q.aula_id).map(paraAPrevia);
  const questionarios = {};
  for (const q of ativas.filter((x) => x.aula_id)) {
    if (!questionarios[q.aula_id]) questionarios[q.aula_id] = [];
    questionarios[q.aula_id].push(paraAPrevia(q));
  }
  const roteiros = {};
  for (const c of lista(casos)) {
    const conteudo = roteiroDoCaso(c.conteudo);
    if (c.aula_id && !c.deleted_at && conteudo) roteiros[c.aula_id] = conteudo;
  }

  const limite = Number(curso?.max_tentativas ?? 0);

  return {
    matricula: {
      id: ID_MATRICULA_PREVIA,
      curso_id: curso?.id ?? null,
      status: "em_andamento",
      avaliacao_aprovada: false,
    },
    curso: {
      id: curso?.id ?? null,
      nome: curso?.nome ?? "",
      codigo: curso?.codigo ?? null,
      descricao: curso?.descricao ?? null,
      carga_horaria_horas: curso?.carga_horaria_horas ?? null,
      projeto_pedagogico_url: urlDe(urls, curso?.projeto_pedagogico_ref),
      tem_avaliacao: questoesPrevia.length > 0,
      ativo: true,
      // como o servidor devolve em `dados` (T8): ausente = EAD
      modalidade: curso?.modalidade || "ead",
      // o tutor como o servidor devolve em `dados` (T21): nome e atendimento; o telefone nunca vai ao aluno
      ...tutorParaAPrevia(curso),
      // o prazo e a dedicação do projeto pedagógico como o servidor devolve em `dados` (T25)
      ...projetoParaAPrevia(curso),
    },
    aulas: aulasPrevia,
    questoes: questoesPrevia,
    // só da prévia (o servidor nunca manda isto ao aluno): gabarito dos questionários e roteiros dos casos
    atividades_previa: {
      nota_minima_modulo: notaMinimaDoModulo(curso?.nota_minima_modulo),
      questionarios,
      casos: roteiros,
    },
    avaliacao: {
      total_questoes: questoesPrevia.length,
      tentativas_usadas: 0,
      tentativas_max: Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : null,
      limite_atingido: false,
      proxima_em: null,
      nota_minima: notaMinimaDe(curso?.nota_minima),
    },
    certificado: null,
    pode_emitir_certificado: false,
    pendencias_certificado: [],
    // a prévia não tem aluno: não há pré-requisito a cumprir (o servidor devolve null quando o curso não exige)
    pre_requisito: null,
    duvidas: [],
  };
}

/** Inteiro sorteado em [0, n). Na prévia o sorteio pode ser o do navegador: nada aqui vale como prova. */
const sorteioDoNavegador = (n) => Math.floor(Math.random() * n);

/** Fisher–Yates numa cópia. */
function embaralhar(itens, aleatorio) {
  const a = [...itens];
  for (let i = a.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A prova sorteada da prévia, no formato que o servidor devolve em `iniciar_avaliacao`: questões na ordem
 * sorteada, `opcoes` já na ordem mostrada e `ordem_opcoes` com o índice ORIGINAL de cada posição. Só a
 * prévia leva também `correta` (índice original) e `comentario`, porque o RT vê o gabarito. `aleatorio(n)`
 * devolve um inteiro em [0, n) (nos testes, um sorteio conhecido).
 */
export function sortearPrevia(questoes, aleatorio = sorteioDoNavegador) {
  const sorteadas = lista(questoes).map((q) => {
    const opcoes = opcoesDaQuestao(q.opcoes);
    const ordem = embaralhar(
      opcoes.map((_, i) => i),
      aleatorio
    );
    return {
      id: q.id,
      pergunta: q.pergunta,
      opcoes: ordem.map((i) => opcoes[i]),
      ordem_opcoes: ordem,
      correta: q.correta,
      comentario: q.comentario ?? null,
    };
  });
  return embaralhar(sorteadas, aleatorio);
}

/** Resposta marcada como índice, ou NaN se a questão ficou sem resposta. */
function indiceMarcado(resposta) {
  if (resposta === null || resposta === undefined || resposta === "") return NaN;
  return Number(resposta);
}

/**
 * Correção da prova, igual à do servidor (`corrigirProva`): acerto = resposta marcada igual à
 * alternativa correta; questão sem resposta erra; resposta de questão que não é da prova é ignorada;
 * nota inteira (arredondada) comparada com a mínima. Prova sem questões dá nota 0.
 */
export function corrigirPrevia({ questoes, respostas, notaMinima } = {}) {
  const prova = lista(questoes);
  const marcada = new Map(lista(respostas).map((r) => [r.questao_id, indiceMarcado(r.resposta)]));
  const acertou = (q) => marcada.get(q.id) === q.correta;
  const acertos = prova.filter(acertou).length;
  const total = prova.length;
  const nota = total ? Math.round((acertos / total) * 100) : 0;
  const minima = notaMinimaDe(notaMinima);
  return { marcada, acertou, acertos, total, nota, minima, aprovada: nota >= minima };
}

const MSG_NAO_FUNCIONA_NA_PREVIA =
  "Isto não funciona na prévia: nada é enviado nem gravado. Só um aluno matriculado usa este recurso.";

function erroDaPrevia() {
  return Object.assign(new Error(MSG_NAO_FUNCIONA_NA_PREVIA), { codigo: "PREVIA", extra: {} });
}

/** Recusa no formato do portal de verdade (ErroPortal, components/portal-funcionario/api.js): `extra` é o corpo. */
function erroDoPortal(mensagem, codigo = null, extra = {}) {
  return Object.assign(new Error(mensagem), {
    codigo,
    extra: { success: false, error: mensagem, codigo, ...extra },
  });
}

/** As recusas do caso com o texto do servidor (RECUSAS_DO_CASO, portal-funcionario/caso-aluno.ts). */
const MSG_CASO_INVALIDO = "Este caso está com problema — avise o RH";
const MSG_DO_CASO = {
  CASO_INVALIDO: MSG_CASO_INVALIDO,
  CASO_ENCERRADO: "Este caso já chegou ao fim",
  CASO_FORA_DE_ORDEM: "O caso já está em outra etapa: continue de onde ele parou",
  OPCAO_INVALIDA: "Escolha uma das opções desta etapa",
};

/**
 * API injetada nos componentes do portal durante a prévia (mesmo formato de `apiPortal` em
 * components/portal-funcionario/api.js). Nunca usa a rede.
 * - `evento`: aceito e descartado (nenhuma trilha);
 * - `progresso`: devolve o tempo recebido e NUNCA conclui a aula (nada fica gravado);
 * - `iniciar_avaliacao`: sorteia a prova aqui (`sortearPrevia`), com gabarito e comentário para o RT;
 * - `avaliacao`: corrige aqui, com o gabarito do item; a correção comentada só vem na aprovação (como
 *   no servidor: o RT já vê o gabarito na própria questão), o reprovado recebe o mesmo que o aluno
 *   (`REPROVADO_VE_NOTA`) e a nova tentativa não espera intervalo;
 * - `questionario_abrir`/`questionario_enviar`: sorteio e correção aqui, com a nota mínima do módulo e a
 *   correção comentada nos dois resultados (A2); tentativas livres, contadas só na memória da prévia; a aula
 *   nunca conclui (`aula_concluida: false`);
 * - `caso_abrir`/`caso_escolher`/`caso_concluir`: o roteiro anda aqui, com as regras do servidor
 *   (`estadoDoCaso`, `etapaParaAluno`, `resultadoDaEscolha`, lib/ead-caso.js) e as escolhas só na memória;
 *   concluir não conclui a aula e recomeça o caso, para o RT andar por ele de novo;
 * - o resto (dúvida, certificado, ciência, login...) falha com `codigo: "PREVIA"`.
 * `aleatorio(n)` (inteiro em [0, n)) existe para o teste; o padrão é o sorteio do navegador.
 */
export function criarApiPrevia({ item, aleatorio = sorteioDoNavegador } = {}) {
  const questoes = lista(item?.questoes);
  const avaliacao = item?.avaliacao ?? {};
  const atividades = item?.atividades_previa ?? {};
  const notaDoModulo = notaMinimaDoModulo(atividades.nota_minima_modulo);
  // só na memória desta prévia (nada é gravado): tentativas enviadas por questionário e escolhas por caso
  const enviadas = new Map();
  const escolhasDoCaso = new Map();

  // a aula pedida precisa ser do curso e do tipo da ação, como o servidor confere (aulaDaAtividade)
  const conferirAula = (aulaId, tipo, nome) => {
    const aula = lista(item?.aulas).find((a) => a.id === aulaId);
    if (!aula) throw erroDoPortal("Aula não pertence ao curso");
    if (aula.tipo !== tipo) throw erroDoPortal(`Esta aula não é ${nome}`);
  };

  const questoesDoQuestionario = (aulaId) => {
    conferirAula(aulaId, "questionario", "um questionário");
    const daAula = lista(atividades.questionarios?.[aulaId]);
    if (!daAula.length) {
      throw erroDoPortal(
        "Este questionário ainda não tem questões — avise o RH",
        "QUESTIONARIO_VAZIO"
      );
    }
    return daAula;
  };

  // o estado do caso é refeito a cada ação a partir das escolhas, como o servidor faz com a trilha
  const casoAtual = (aulaId) => {
    conferirAula(aulaId, "caso", "um caso");
    const conteudo = atividades.casos?.[aulaId] ?? null;
    const escolhas = escolhasDoCaso.get(aulaId) ?? [];
    const estado = conteudo ? estadoDoCaso(conteudo, escolhas) : { valido: false };
    if (!estado.valido) throw erroDoPortal(MSG_CASO_INVALIDO, "CASO_INVALIDO");
    return { conteudo, escolhas, estado };
  };

  // a tela do caso como a ação `caso_abrir` do servidor a devolve (e o `estado` do CASO_FORA_DE_ORDEM)
  const telaDoCaso = (conteudo, estado) =>
    estado.fim
      ? {
          situacao: "fim",
          contexto: textoDe(conteudo.contexto),
          reflexao: textoDe(conteudo.reflexao),
          ultimo: estado.ultimo,
        }
      : {
          situacao: "etapa",
          contexto: textoDe(conteudo.contexto),
          etapa: etapaParaAluno(conteudo, estado.etapaAtual, aleatorio),
          passagem: estado.passagens[estado.etapaAtual] ?? 1,
          ultimo: estado.ultimo,
        };

  async function chamarPortal(acao, dados = {}) {
    switch (acao) {
      case "evento":
        return { success: true };
      case "progresso": {
        const segundos = Math.floor(Number(dados?.segundos_assistidos));
        return {
          success: true,
          segundos_assistidos: Number.isFinite(segundos) && segundos > 0 ? segundos : 0,
          aula_concluida: false,
          curso_concluido: false,
          precisa_avaliacao: false,
        };
      }
      case "iniciar_avaliacao":
        return {
          success: true,
          tentativa: 1,
          tentativas_max: avaliacao.tentativas_max ?? null,
          nota_minima: notaMinimaDe(avaliacao.nota_minima),
          questoes: sortearPrevia(questoes),
        };
      case "avaliacao": {
        const { acertou, acertos, total, nota, minima, aprovada } = corrigirPrevia({
          questoes,
          respostas: dados?.respostas,
          notaMinima: avaliacao.nota_minima,
        });
        return {
          success: true,
          resultado: aprovada ? "satisfatorio" : "insatisfatorio",
          aprovada,
          // como o servidor: nota, acertos e total para o aprovado e, se REPROVADO_VE_NOTA, o reprovado
          ...(aprovada || REPROVADO_VE_NOTA ? { nota, acertos, total } : {}),
          nota_minima: minima,
          tentativa: 1,
          tentativas_max: avaliacao.tentativas_max ?? null,
          proxima_em: null,
          curso_concluido: false,
          revisao: aprovada
            ? questoes.map((q) => ({
                questao_id: q.id,
                acertou: acertou(q),
                resposta_correta: q.opcoes?.[q.correta] ?? null,
                comentario: q.comentario ?? null,
              }))
            : null,
        };
      }
      case "questionario_abrir": {
        const daAula = questoesDoQuestionario(dados?.aula_id);
        return {
          success: true,
          concluida: false,
          tentativa: (enviadas.get(dados.aula_id) ?? 0) + 1,
          nota_minima: notaDoModulo,
          questoes: sortearPrevia(daAula, aleatorio),
        };
      }
      case "questionario_enviar": {
        const daAula = questoesDoQuestionario(dados?.aula_id);
        const tentativa = (enviadas.get(dados.aula_id) ?? 0) + 1;
        enviadas.set(dados.aula_id, tentativa);
        const { acertou, acertos, total, nota, minima, aprovada } = corrigirPrevia({
          questoes: daAula,
          respostas: dados?.respostas,
          notaMinima: notaDoModulo,
        });
        return {
          success: true,
          resultado: aprovada ? "satisfatorio" : "insatisfatorio",
          aprovada,
          nota,
          acertos,
          total,
          nota_minima: minima,
          tentativa,
          // a prévia nunca conclui a aula (nada é gravado), como o `progresso` dela
          aula_concluida: false,
          curso_concluido: false,
          // como o servidor (A2): a correção comentada vai aprovado ou não
          revisao: daAula.map((q) => ({
            questao_id: q.id,
            acertou: acertou(q),
            resposta_correta: q.opcoes?.[q.correta] ?? null,
            comentario: q.comentario ?? null,
          })),
        };
      }
      case "caso_abrir": {
        const { conteudo, estado } = casoAtual(dados?.aula_id);
        return { success: true, ...telaDoCaso(conteudo, estado) };
      }
      case "caso_escolher": {
        const aulaId = dados?.aula_id;
        const { conteudo, escolhas, estado } = casoAtual(aulaId);
        const r = resultadoDaEscolha(conteudo, estado, dados?.etapa_id, dados?.opcao);
        if (!r.ok) {
          throw erroDoPortal(
            MSG_DO_CASO[r.codigo] ?? MSG_CASO_INVALIDO,
            r.codigo,
            r.codigo === "CASO_FORA_DE_ORDEM" ? { estado: telaDoCaso(conteudo, estado) } : {}
          );
        }
        escolhasDoCaso.set(aulaId, [...escolhas, { etapa: dados.etapa_id, opcao: dados.opcao }]);
        return {
          success: true,
          comentario: r.comentario,
          segura: r.segura,
          passagem: r.passagem,
          fim: r.fim,
          etapa:
            r.fim || r.proxima === null ? null : etapaParaAluno(conteudo, r.proxima, aleatorio),
          reflexao: r.fim ? textoDe(conteudo.reflexao) : null,
        };
      }
      case "caso_concluir": {
        const aulaId = dados?.aula_id;
        const { estado } = casoAtual(aulaId);
        if (!estado.fim) {
          throw erroDoPortal("Chegue ao fim do caso para concluir", "CASO_INCOMPLETO");
        }
        // a prévia não conclui a aula: o caso recomeça do início para o RT andar por ele de novo
        escolhasDoCaso.delete(aulaId);
        return {
          success: true,
          aula_concluida: false,
          curso_concluido: false,
          precisa_avaliacao: false,
          status: "em_andamento",
        };
      }
      default:
        throw erroDaPrevia();
    }
  }

  return { previa: true, chamarPortal };
}
