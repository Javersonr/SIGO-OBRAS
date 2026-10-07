/**
 * Avisos ao funcionário sobre a matrícula (T22) — regras puras, sem DOM e sem rede.
 *
 * Duas coisas:
 *  1. O que a tela do RH faz depois de avisar UM funcionário pelo botão do WhatsApp (`decidirAvisoAoRH`):
 *     a mensagem com a senha provisória NÃO é mais copiada para a área de transferência sozinha. Quando
 *     há senha nova, ou quando nada foi enviado (sem telefone, telefone inválido), abre uma janela que
 *     mostra a senha UMA vez e deixa o RH copiar a mensagem se quiser.
 *  2. O aviso em lote aos atrasados (`prepararLoteDeAtrasados`): uma mensagem por funcionário, só pelo
 *     canal automático e sem senha (quem não tem acesso ao portal fica de fora e é listado). O envio em
 *     lote respeita o teto do canal (`LIMITE_DO_LOTE`) e pára quando o canal recusa (`deveInterromperOLote`).
 *
 * Quem usa: components/seguranca/AvisoAcessoDialog.jsx, AvisoAtrasadosDialog.jsx e TreinamentosEadTab.jsx.
 * Os testes ficam em ead-aviso-matricula.test.js.
 */
import { digitosTelefone, telefoneValido } from "./telefone";

const COLADOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const dataBR = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const primeiroNome = (nome) =>
  String(nome ?? "")
    .trim()
    .split(/\s+/)[0] || "";

// ------------------------------------------------------------------------- aviso a um funcionário

/**
 * O que fazer depois de `avisarNoPortal`: `via` é o canal ("evolution" = automático; "wa.me" = o WhatsApp do
 * RH foi aberto; "invalido" = telefone inválido; null = sem telefone) e `credenciais` o acesso recém-criado
 * (com `senha_provisoria`).
 * @returns {{
 *   situacao: "enviado"|"aberto"|"telefone_invalido"|"sem_telefone",
 *   temSenha: boolean,
 *   dialogo: boolean,
 *   aviso: { tipo: "success", texto: string } | null,
 * }}
 */
export function decidirAvisoAoRH({ via, credenciais } = {}) {
  const situacao =
    via === "evolution"
      ? "enviado"
      : via === "wa.me"
        ? "aberto"
        : via === "invalido"
          ? "telefone_invalido"
          : "sem_telefone";
  const temSenha = !!credenciais?.senha_provisoria;
  const naoEntregue = situacao === "telefone_invalido" || situacao === "sem_telefone";
  return {
    situacao,
    temSenha,
    dialogo: temSenha || naoEntregue,
    aviso:
      situacao === "enviado" ? { tipo: "success", texto: "Aviso enviado pelo WhatsApp" } : null,
  };
}

const TEXTO_DA_SITUACAO = {
  enviado: "A mensagem foi enviada pelo WhatsApp.",
  aberto:
    "O WhatsApp foi aberto com a mensagem pronta. Confira se você a enviou; o envio não é automático.",
  sem_telefone:
    "O funcionário não tem telefone cadastrado, então nada foi enviado. Copie a mensagem e entregue a ele por outro meio.",
  telefone_invalido:
    "O telefone cadastrado é inválido, então nada foi enviado. Corrija o cadastro e, por enquanto, copie a mensagem e entregue por outro meio.",
};

/** O parágrafo da janela: o que aconteceu com a mensagem e, havendo senha, que ela aparece só agora. */
export function textoDoDialogoDeAviso({ situacao, temSenha } = {}) {
  const partes = [TEXTO_DA_SITUACAO[situacao] ?? TEXTO_DA_SITUACAO.sem_telefone];
  if (temSenha) {
    partes.push(
      "A senha provisória aparece só desta vez e não fica guardada em lugar nenhum. " +
        "No primeiro acesso o funcionário cria a senha pessoal dele."
    );
  }
  return partes.join(" ");
}

// -------------------------------------------------------------------------------- lote de atrasados

/** Mensagens por clique em "Avisar atrasados": o canal aceita 60 por hora por usuário. */
export const LIMITE_DO_LOTE = 30;
const ITENS_NO_TEXTO = 8;

/**
 * A mensagem do lembrete: os cursos atrasados com o prazo de cada um e o link do portal. Não leva senha:
 * só vai a quem já tem acesso. Quem ainda não fez o primeiro acesso (`primeiroAcessoPendente`) não tem "a sua
 * senha": a mensagem manda usar a provisória que o RH passou e criar a pessoal (A6).
 * @param {{ nome: string, itens: Array<{ cursoNome: string, limite: string }>, urlPortal: string,
 *   primeiroAcessoPendente?: boolean }} p
 */
export function textoDeAtraso({ nome, itens, urlPortal, primeiroAcessoPendente = false }) {
  const lista = itens ?? [];
  const n = lista.length;
  const saudacao = primeiroNome(nome) ? `Olá, ${primeiroNome(nome)}!` : "Olá!";
  const linhas = lista
    .slice(0, ITENS_NO_TEXTO)
    .map((i) => `- ${i.cursoNome} (prazo: ${dataBR(i.limite)})`);
  if (n > ITENS_NO_TEXTO) linhas.push(`e mais ${n - ITENS_NO_TEXTO}`);
  return [
    `${saudacao} Você tem ${n} ${n === 1 ? "treinamento atrasado" : "treinamentos atrasados"} ` +
      "no Portal do Funcionário:",
    linhas.join("\n"),
    `Conclua o quanto antes: ${urlPortal}`,
    primeiroAcessoPendente
      ? "Entre com o seu usuário (CPF) e a senha provisória que o RH passou; no primeiro acesso você " +
        "cria a sua senha. Se não tiver mais a senha provisória, fale com o RH."
      : "Entre com o seu usuário (CPF) e a sua senha.",
  ].join("\n\n");
}

const MOTIVO_PULADO = {
  sem_telefone: "Sem telefone cadastrado",
  telefone_invalido: "Telefone inválido: corrija o cadastro",
  sem_acesso:
    "Sem acesso ao portal: use o botão do WhatsApp da linha da matrícula, que cria o acesso e envia a senha",
  acesso_desativado: "Acesso ao portal desativado: reative na Ficha do funcionário",
  acesso_desconhecido: "Não foi possível conferir o acesso ao portal",
  avisado_hoje: "Já recebeu o aviso hoje",
};

/** Texto de tela do motivo de um funcionário não receber o aviso em lote. */
export function rotuloDoMotivoPulado(motivo) {
  return MOTIVO_PULADO[motivo] ?? "Não foi possível avisar";
}

/**
 * Separa quem recebe o lembrete de quem fica de fora. `linhas` são as linhas da tabela
 * (`montarLinhas`); só entram as `atrasada`. `acessos` = a lista de `funcionarioAcesso.status`
 * (`funcionario_id`, `ativo`, `bloqueado`), ou null se não deu para consultar (ninguém é enviado).
 * Quem tem acesso bloqueado por erro de senha ainda recebe: o bloqueio passa sozinho. `avisadosHoje` são os
 * ids de quem já recebeu o lembrete hoje (uma rodada anterior): ficam de fora para ninguém receber duas vezes.
 *
 * Curso DESPUBLICADO (`linha.curso.ativo === false`) fica fora (A6): o aluno não consegue fazê-lo, então o
 * lembrete não pode cobrá-lo; `despublicados` conta as matrículas atrasadas ignoradas por isso, e quem só
 * tem atraso nelas não recebe nem aparece em `pulados`. Quem ainda não fez o primeiro acesso recebe o texto
 * da senha provisória, não "a sua senha" (`textoDeAtraso`).
 * @returns {{
 *   enviar: Array<{ funcionarioId: string, nome: string, telefone: string, numero: string,
 *                   itens: Array<{ cursoNome: string, limite: string, diasDeAtraso: number }>, texto: string,
 *                   primeiroAcessoPendente: boolean }>,
 *   pulados: Array<{ funcionarioId: string, nome: string, motivo: string, itens: object[] }>,
 *   excedente: number,
 *   despublicados: number,
 * }}
 */
export function prepararLoteDeAtrasados({
  linhas,
  acessos,
  urlPortal,
  limite = LIMITE_DO_LOTE,
  avisadosHoje = [],
} = {}) {
  const jaAvisados = new Set(avisadosHoje ?? []);
  const porFuncionario = new Map();
  let despublicados = 0;
  for (const l of linhas ?? []) {
    if (!l?.atrasada) continue;
    if (l.curso?.ativo === false) {
      despublicados += 1;
      continue;
    }
    const grupo = porFuncionario.get(l.funcionarioId) ?? {
      funcionario: l.funcionario,
      nome: l.funcionario?.nome_completo || l.funcionarioNome || "",
      itens: [],
    };
    grupo.itens.push({
      cursoNome: l.cursoNome,
      limite: l.prazo?.limite ?? "",
      diasDeAtraso: l.prazo?.diasDeAtraso ?? 0,
    });
    porFuncionario.set(l.funcionarioId, grupo);
  }
  const acessoDe = Array.isArray(acessos)
    ? new Map(acessos.map((a) => [a.funcionario_id, a]))
    : null;

  const enviar = [];
  const pulados = [];
  const grupos = [...porFuncionario.entries()].sort((a, b) =>
    COLADOR.compare(a[1].nome, b[1].nome)
  );
  for (const [funcionarioId, g] of grupos) {
    const itens = g.itens.sort((a, b) => String(a.limite).localeCompare(String(b.limite)));
    const pular = (motivo) => pulados.push({ funcionarioId, nome: g.nome, motivo, itens });
    const telefone = g.funcionario?.telefone ?? "";
    const acesso = acessoDe?.get(funcionarioId);
    if (jaAvisados.has(funcionarioId)) pular("avisado_hoje");
    else if (!acessoDe) pular("acesso_desconhecido");
    else if (!acesso) pular("sem_acesso");
    else if (acesso.ativo === false) pular("acesso_desativado");
    else if (!digitosTelefone(telefone)) pular("sem_telefone");
    else if (!telefoneValido(telefone)) pular("telefone_invalido");
    else {
      const primeiroAcessoPendente = acesso.primeiro_acesso_pendente === true;
      enviar.push({
        funcionarioId,
        nome: g.nome,
        telefone,
        numero: digitosTelefone(telefone),
        itens,
        primeiroAcessoPendente,
        texto: textoDeAtraso({ nome: g.nome, itens, urlPortal, primeiroAcessoPendente }),
      });
    }
  }
  const excedente = Math.max(0, enviar.length - limite);
  return { enviar: enviar.slice(0, limite), pulados, excedente, despublicados };
}

/**
 * Quem já recebeu o lembrete hoje, a partir do texto guardado no navegador (JSON `{ dia, ids }`). Texto
 * vazio, quebrado ou de outro dia = ninguém: o registro vale só no dia em que foi feito.
 * @returns {string[]}
 */
export function idsAvisadosHoje(bruto, hoje) {
  try {
    const lido = JSON.parse(bruto);
    if (lido?.dia !== hoje || !Array.isArray(lido.ids)) return [];
    return lido.ids.filter((id) => typeof id === "string");
  } catch {
    return [];
  }
}

/** O texto a guardar depois de um lote: os de hoje que já estavam mais os recém-avisados, sem repetir. */
export function guardarAvisadosHoje(bruto, hoje, novosIds) {
  const ids = [...new Set([...idsAvisadosHoje(bruto, hoje), ...(novosIds ?? [])])];
  return JSON.stringify({ dia: hoje, ids });
}

/**
 * Como o envio automático de UMA mensagem terminou, a partir do que `sigo.functions.invoke("enviarWhatsApp")`
 * devolve (`{ data, error }`; o `error.context.status` é o HTTP).
 * @returns {"enviado"|"canal_nao_configurado"|"limite"|"indisponivel"|"falhou"}
 */
export function classificarEnvio(resposta) {
  const data = resposta?.data;
  if (!data) return "falhou";
  if (data.success !== false) return "enviado";
  if (data.error === "EVOLUTION_NAO_CONFIGURADA") return "canal_nao_configurado";
  const status = Number(resposta?.error?.context?.status);
  if (data.codigo === "LIMITE" || status === 429) return "limite";
  if (status === 503) return "indisponivel";
  return "falhou";
}

/** O lote pára quando o canal não vai aceitar os próximos; falha de uma mensagem só não pára os outros. */
export function deveInterromperOLote(classe) {
  return classe === "limite" || classe === "indisponivel" || classe === "canal_nao_configurado";
}

const MOTIVO_DA_INTERRUPCAO = {
  limite:
    "O canal chegou ao limite de mensagens por hora. Os que faltam podem ser avisados daqui a pouco.",
  indisponivel: "O envio automático ficou indisponível no momento.",
  canal_nao_configurado: "O WhatsApp automático não está configurado.",
};

/**
 * O resultado do lote para a tela: quantos foram, quem falhou, o que não chegou a ser tentado.
 * `resultados` = `[{ funcionarioId, nome, classe }]` na ordem em que foram tentados.
 */
export function resumirLote({ resultados, naoTentados = 0, interrompidoPor = null } = {}) {
  const lista = resultados ?? [];
  const enviados = lista.filter((r) => r.classe === "enviado").length;
  const falhas = lista.filter((r) => r.classe !== "enviado");
  const partes = [`${enviados} de ${lista.length} aviso(s) enviado(s).`];
  if (falhas.length) partes.push(`${falhas.length} falharam: veja a lista abaixo.`);
  if (naoTentados) partes.push(`${naoTentados} não chegaram a ser enviados.`);
  if (interrompidoPor) partes.push(MOTIVO_DA_INTERRUPCAO[interrompidoPor] ?? "");
  return {
    enviados,
    falhas,
    naoTentados,
    interrompidoPor,
    tipo: falhas.length || naoTentados || interrompidoPor ? "warning" : "success",
    texto: partes.filter(Boolean).join(" "),
  };
}
