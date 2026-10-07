// Trilha de auditoria do EAD (tela do RH). Função pura: sem importar @/api/sigoClient.

/** Texto do selo nos eventos que o navegador do aluno relatou (e não o servidor). */
export const ROTULO_ORIGEM_NAVEGADOR = "informado pelo navegador";

/**
 * Origem do evento da trilha (`treinamento_evento.origem`, migração 0135): "navegador" quando o
 * navegador do aluno INFORMOU o que aconteceu (abriu a aula, play, pausa, saiu da aba...; o servidor
 * só carimba hora e IP) e "servidor" quando o servidor viu e decidiu (login, aula concluída, prova,
 * certificado...). Só esses dois valores (os do check do banco) saem como estão. A falta da origem
 * (resposta de antes da migração) ou um valor desconhecido saem VAZIOS: a tela e o CSV não afirmam
 * "servidor" sobre o que não sabem (T17, M3). Só "navegador" vira selo.
 */
export function origemDoEvento(evento) {
  const origem = evento?.origem;
  return origem === "navegador" || origem === "servidor" ? origem : "";
}

/** O evento leva o selo "informado pelo navegador"? */
export function eventoInformadoPeloNavegador(evento) {
  return origemDoEvento(evento) === "navegador";
}

// ---------------------------------------------------------------------------------------------
// Rótulos e descrição dos eventos (T18)
// ---------------------------------------------------------------------------------------------

/**
 * Texto de cada evento da trilha, em português. TODO evento que as Edge Functions gravam precisa estar
 * aqui: `ead-trilha.test.js` lê o código do servidor e acusa o que faltar (o nome técnico não pode
 * aparecer para o RH nem para a fiscalização). Evento novo no servidor = linha nova aqui.
 */
export const ROTULO_EVENTO = {
  login: "Entrou no portal",
  login_falha: "Senha errada no login",
  logout: "Saiu do portal",
  troca_senha: "Trocou a senha",
  acesso_criado: "Acesso criado pelo RH",
  senha_redefinida: "Senha redefinida pelo RH",
  acesso_desativado: "Acesso desativado pelo RH",
  acesso_reativado: "Acesso reativado pelo RH",
  abrir_curso: "Abriu o curso",
  abrir_aula: "Abriu a aula",
  play: "Iniciou o vídeo",
  pausa: "Pausou",
  fim_video: "Terminou o vídeo",
  aba_oculta: "Saiu da tela (tempo parado)",
  aba_visivel: "Voltou à tela",
  progresso_ajustado: "Tempo informado acima do real — ajustado pelo servidor",
  apostila_lida: "Leu a apostila (tempo mínimo cumprido)",
  aula_concluida: "Concluiu a aula",
  avaliacao_inicio: "Abriu a avaliação",
  avaliacao_iniciada: "Prova aberta (ordem sorteada pelo servidor)",
  avaliacao_envio: "Enviou a avaliação",
  tentativa_liberada: "Tentativa extra liberada pelo RH",
  curso_concluido: "Concluiu o curso",
  certificado_assinado: "Assinou o certificado",
  certificado_revogado: "Certificado revogado pelo RH",
  abrir_certificado: "Baixou o certificado",
  abrir_projeto: "Abriu o projeto pedagógico",
  duvida_enviada: "Enviou dúvida ao tutor",
  declaracao_ambiente: "Declarou o ambiente e o horário de estudo",
  ciencia: "Deu ciência de entrega",
};

/** Rótulo do evento; evento que ainda não tem rótulo aparece pelo nome, nunca em branco. */
export function rotuloDoEvento(nome) {
  if (!nome) return "";
  return Object.hasOwn(ROTULO_EVENTO, nome) ? ROTULO_EVENTO[nome] : String(nome);
}

/** Cor da linha: "atencao" (âmbar), "revogado" (vermelho) ou "normal". */
export function tomDoEvento(nome) {
  if (nome === "certificado_revogado") return "revogado";
  if (nome === "progresso_ajustado" || nome === "login_falha") return "atencao";
  return "normal";
}

/** Segundos em texto curto: "1h02" (a partir de 1 hora) ou "9min 30s". Valor inválido vale 0. */
export function formatarTempo(segundos) {
  const n = Number(segundos);
  const t = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min ${t % 60}s`;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Complemento da linha do evento ("tentativa 2 · nota 60% · reprovado", "por rh@..."). Vazio se não há. */
export function descreverDetalhe(evento) {
  const e = evento || {};
  const d = e.detalhe || {};
  const juntar = (...partes) => partes.filter(Boolean).join(" · ");
  switch (e.evento) {
    case "avaliacao_envio":
      return `tentativa ${d.tentativa} · nota ${d.nota}% · ${d.aprovada ? "aprovado" : "reprovado"}`;
    case "avaliacao_iniciada":
      return `tentativa ${d.tentativa}`;
    case "progresso_ajustado":
      return `pediu +${d.pedido}s, aceito +${d.aceito}s`;
    case "login_falha":
      return d.bloqueou ? "acesso bloqueado por 15 min" : `tentativa ${d.tentativa}`;
    case "aula_concluida":
      return `${formatarTempo(d.segundos)} assistidos`;
    case "apostila_lida":
      return d.minimo
        ? `${formatarTempo(d.segundos)} de leitura (mínimo ${formatarTempo(d.minimo)})`
        : `${formatarTempo(d.segundos)} de leitura`;
    case "certificado_assinado":
      return `código ${d.codigo}`;
    case "tentativa_liberada":
      return juntar(
        d.por && `por ${d.por}`,
        Number.isInteger(d.tentativas_extras) &&
          `${plural(d.tentativas_extras, "tentativa extra", "tentativas extras")} no total`
      );
    case "declaracao_ambiente":
      // o texto inteiro fica no evento (é a prova do que o aluno leu), mas não polui a linha da trilha
      return juntar(
        d.texto_padrao === true
          ? "texto padrão, sem aprovação do RT"
          : Number.isInteger(d.versao) && `texto v${d.versao}`,
        d.art && `ART: ${d.art}`
      );
    case "certificado_revogado":
      return juntar(
        d.por && `por ${d.por}`,
        d.codigo && `código ${d.codigo}`,
        d.motivo && `motivo: ${d.motivo}`
      );
    default:
      return d.por ? `por ${d.por}` : "";
  }
}

/**
 * Hora (do servidor) em que a prova da tentativa `numero` foi aberta pela 1ª vez: o evento
 * `avaliacao_iniciada` daquela tentativa. Tentativas de antes da T16 não têm o evento (null).
 */
export function abertaEmDaTentativa(eventos, numero) {
  let primeira = null;
  for (const e of eventos || []) {
    if (e?.evento !== "avaliacao_iniciada" || e.detalhe?.tentativa !== numero) continue;
    const t = Date.parse(e.created_at);
    if (Number.isFinite(t) && (primeira === null || t < Date.parse(primeira)))
      primeira = e.created_at;
  }
  return primeira;
}
