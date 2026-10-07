/**
 * Regras puras da tela do RH dos treinamentos EAD (T19) — sem DOM e sem rede.
 *
 * Quem usa: components/seguranca/TreinamentosEadTab.jsx (mover aula, matricular e remover matrícula
 * — T20; formulários abertos, cargas por empresa e certificados por matrícula — A2). Os testes
 * ficam em ead-gestao.test.js. A tela só liga a rede: aqui se decide o que gravar.
 */

import { tipoDaNovaMatricula } from "./ead-tipo-matricula";

/**
 * Move a aula `aulaId` uma posição na lista (dir = -1 sobe, +1 desce) e devolve a lista renumerada
 * 1..n, que é o que a tela grava. `aulas` vem na ordem em que o RH enxerga (a da coluna `ordem`).
 *
 * - `ids`: os ids na nova ordem.
 * - `mudancas`: só as aulas cuja `ordem` gravada difere da nova posição, na ordem da lista. A
 *   renumeração (e não a troca dos dois valores) também desfaz buracos e empates deixados por aula
 *   removida ou por gravação que parou no meio.
 *
 * Devolve null quando não há o que mover: lista vazia, aula inexistente, sentido diferente de -1/+1
 * ou aula já na ponta.
 */
export function reordenarAulas(aulas, aulaId, dir) {
  if (!Array.isArray(aulas) || (dir !== -1 && dir !== 1)) return null;
  const origem = aulas.findIndex((a) => a?.id === aulaId);
  const destino = origem + dir;
  if (origem < 0 || destino < 0 || destino >= aulas.length) return null;
  const lista = [...aulas];
  [lista[origem], lista[destino]] = [lista[destino], lista[origem]];
  const mudancas = [];
  lista.forEach((a, i) => {
    const ordem = i + 1;
    if (a.ordem !== ordem) mudancas.push({ id: a.id, ordem });
  });
  return { ids: lista.map((a) => a.id), mudancas };
}

/** O que a tela diz quando o banco recusa uma matrícula aberta repetida (A6). */
export const MSG_MATRICULA_JA_ABERTA =
  "Esta pessoa já tem uma matrícula aberta neste curso (outro usuário pode ter acabado de matricular). " +
  "A lista foi atualizada; confira quem já está matriculado antes de tentar de novo.";

/**
 * Traduz o erro do banco ao criar matrícula (A6). O índice único `treinamento_matricula_viva_uidx` (migração
 * 0139) recusa a SEGUNDA matrícula aberta do mesmo funcionário no mesmo curso: duas abas, ou dois RHs, matriculando
 * a mesma pessoa ao mesmo tempo. O erro cru ("duplicate key value violates unique constraint ...") não diz nada
 * ao RH. O SDK lança o erro do PostgREST (`{ code: "23505", message }`), não um `Error`: reconhece pelo código
 * ou, se ele não vier, pelo texto. A causa original fica em `cause`. Qualquer outro erro volta como veio.
 */
export function erroDeMatricula(erro) {
  const duplicada =
    String(erro?.code ?? "") === "23505" ||
    /duplicate key value violates unique constraint/i.test(String(erro?.message ?? ""));
  return duplicada ? new Error(MSG_MATRICULA_JA_ABERTA, { cause: erro }) : erro;
}

/**
 * Matrículas a criar para os funcionários escolhidos num curso. Quem já tem matrícula aberta (não
 * concluída) no curso é ignorado; quem já concluiu pode ser matriculado de novo (renovação). Todas
 * as linhas levam as mesmas chaves, como o `bulkCreate` (um INSERT só) exige.
 *
 * Tipo do treinamento (T23, NR-1 1.7.1.2): `tipo` é a escolha do RH ("inicial", "periodico", "eventual" ou o
 * automático, que é o padrão: periódico para quem já concluiu o curso, inicial para os outros) e `motivo` só vale
 * no eventual. Cada linha leva `tipo` e `motivo_eventual` (sempre as duas chaves, o motivo nulo fora do eventual).
 * A regra está em ead-tipo-matricula.js.
 */
export function matriculasNovas({ matriculas, cursoId, funcionarioIds, empresaId, tipo, motivo }) {
  const abertos = new Set(
    (Array.isArray(matriculas) ? matriculas : [])
      .filter((m) => m?.curso_id === cursoId && m.status !== "concluido")
      .map((m) => m.funcionario_id)
  );
  const escolhidos = [...new Set(Array.isArray(funcionarioIds) ? funcionarioIds : [])];
  const novas = escolhidos
    .filter((id) => !abertos.has(id))
    .map((funcionario_id) => ({
      empresa_id: empresaId,
      curso_id: cursoId,
      funcionario_id,
      status: "pendente",
      ...tipoDaNovaMatricula({ tipo, motivo, funcionarioId: funcionario_id, cursoId, matriculas }),
    }));
  return { novas, ignorados: escolhidos.length - novas.length };
}

/**
 * Mensagem mostrada quando a remoção é bloqueada por `podeRemoverMatricula`. O botão "Revogar" fica
 * nos detalhes da matrícula (MatriculaAuditoriaSheet).
 */
export const MSG_REVOGUE_ANTES =
  "Esta matrícula tem certificado emitido e ainda válido. Revogue o certificado antes de remover " +
  "a matrícula: abra os Detalhes da matrícula (coluna Ações) e use o botão Revogar.";

/**
 * Pode remover a matrícula? Não, enquanto ela tiver um certificado emitido que não foi revogado:
 * remover a matrícula some com o curso do portal e da tela, mas o certificado continuaria válido na
 * consulta pública, sem ninguém para revogá-lo.
 *
 * `certificado` é a linha de `treinamento_certificado` da matrícula (no máximo uma: `matricula_id` é
 * único) ou vazio quando não há. Sem certificado pode: curso em andamento, ou concluído e ainda sem
 * assinatura do aluno. Revogado também pode (já não vale mais nada). Sem matrícula, não há o que
 * remover (false).
 */
export function podeRemoverMatricula(matricula, certificado) {
  if (!matricula) return false;
  if (!certificado) return true;
  return !!certificado.revogado_em;
}

/**
 * Texto da confirmação de remoção. Descreve o que de fato acontece: a exclusão é lógica (a matrícula
 * ganha `deleted_at`), então o aluno perde o curso no portal e a tela deixa de mostrar a matrícula,
 * mas progresso, tentativas e trilha continuam no banco como registro de auditoria. Rematricular
 * cria uma matrícula nova, que começa do zero. Só vale para matrícula que `podeRemoverMatricula`
 * liberou.
 */
export function textoConfirmarRemocao({ matricula, certificado, nomeFuncionario, nomeCurso }) {
  const de = nomeFuncionario ? `de ${nomeFuncionario}` : "deste funcionário";
  const em = nomeCurso ? `no curso "${nomeCurso}"` : "neste curso";

  let situacao;
  if (certificado?.revogado_em) {
    situacao =
      "O certificado dele já está revogado e continua aparecendo como revogado na consulta pública.";
  } else if (matricula?.status === "concluido") {
    situacao =
      "O funcionário concluiu o curso, mas ainda não assinou o certificado: a conclusão deixa de " +
      "valer e ele não poderá mais assinar nem emitir o certificado.";
  } else if (matricula?.status === "em_andamento") {
    situacao = "O curso está em andamento.";
  } else {
    situacao = "O funcionário ainda não iniciou o curso.";
  }

  return [
    `Remover a matrícula ${de} ${em}?`,
    "",
    situacao,
    "",
    "• O funcionário deixa de ver o curso no Portal do Funcionário.",
    "• O progresso nas aulas, as tentativas da prova e a trilha de acessos ficam guardados como " +
      "registro de auditoria, mas não aparecem mais nesta tela.",
    "• Se for matriculado de novo, o curso recomeça do zero (aulas, tempo assistido e tentativas).",
  ].join("\n");
}

// ------------------------------------------------------------- formulários abertos (A2)
// Depois de um `await` (gravação lenta) a tela pode estar mostrando OUTRO formulário: o RH fechou o
// painel e abriu outro curso, ou o editor de outra aula. Quem grava guarda uma referência do
// formulário que gravou e, no fim, só mexe na tela se ainda for o mesmo.

let sequenciaDeRascunhos = 0;

/**
 * Dados de um formulário NOVO (curso ou questão ainda sem `id`), com um token em `rascunho`. O token
 * acompanha o objeto enquanto o RH digita (`{ ...form, campo }` copia a chave) e identifica ESTE
 * formulário depois da gravação. Não vai para o banco: quem grava monta os campos um a um.
 */
export function novoRascunho(dados = {}) {
  return { ...dados, rascunho: `r${++sequenciaDeRascunhos}` };
}

/**
 * `atual` (o que a tela mostra agora) ainda é o formulário `referencia` (o que estava aberto quando
 * a gravação começou)? Registro já gravado: vale o `id`. Rascunho: vale o token, e só enquanto
 * ainda não recebeu o `id` da gravação. Sem `id` e sem token não há como identificar: nunca confere.
 */
export function mesmoFormulario(atual, referencia) {
  if (!atual || !referencia) return false;
  if (referencia.id) return atual.id === referencia.id;
  return !!referencia.rascunho && !atual.id && atual.rascunho === referencia.rascunho;
}

/**
 * Depois de gravar uma aula (envio lento: vídeo de até 1 GB), o formulário de "nova aula" só é limpo se a
 * tela ainda mostra o que estava aberto quando o envio começou: a MESMA empresa (`mesmaEmpresa`, do
 * controle de cargas) e o MESMO curso (`cursoAberto` é o que está no painel agora, `cursoDoEnvio`, o que
 * estava aberto no clique). Num curso diferente, ou com o painel fechado, o formulário é de outra
 * digitação e não pode ser sobrescrito com os valores do clique (A2).
 */
export function formularioDeAulaSegueOMesmo({ mesmaEmpresa, cursoAberto, cursoDoEnvio }) {
  return !!mesmaEmpresa && mesmoFormulario(cursoAberto, cursoDoEnvio);
}

// ----------------------------------------------------------------- cargas da tela (A2)

/**
 * Controle das cargas de dados da tela. A carga fica presa à empresa que estava ativa NA HORA de
 * iniciar (e não à do render que criou a função: uma gravação lenta chama o `recarregar` de um
 * render antigo, depois da troca de empresa). Ela deixa de valer quando outra carga começa (a mais
 * nova vence) ou quando a empresa ativa muda. Quem usa: TreinamentosEadTab.jsx.
 */
export function criarControleDeCarga() {
  let empresa = null;
  let ultima = 0;
  return {
    /** Chamado a cada render com a empresa ativa. */
    definirEmpresa(id) {
      empresa = id || null;
    },
    empresaAtual() {
      return empresa;
    },
    /** Começa uma carga para a empresa ativa agora; null se não há empresa ativa. */
    iniciar() {
      if (!empresa) return null;
      return { numero: ++ultima, empresaId: empresa };
    },
    /** Descarta as cargas em andamento (uma gravação já atualizou a tela por conta própria). */
    descartarPendentes() {
      ultima++;
    },
    /** A carga ainda é a mais nova e a empresa ativa é a mesma de quando ela começou. */
    vale(carga) {
      return !!carga && carga.numero === ultima && carga.empresaId === empresa;
    },
    /** `empresaId` ainda é a empresa ativa? Para consultas avulsas e para o fim de uma gravação. */
    mesmaEmpresa(empresaId) {
      return !!empresaId && empresaId === empresa;
    },
  };
}

// --------------------------------------------------------------------- tabela de matrículas (A2)

/**
 * Certificados indexados pelo id da matrícula: a tabela de matrículas consulta uma vez por linha, em
 * tempo constante, em vez de varrer a lista inteira em cada consulta (`matricula_id` é único; se
 * houvesse repetido, vale o primeiro, como o `find` que isto substitui).
 */
export function certificadosPorMatricula(certificados) {
  const mapa = new Map();
  for (const c of Array.isArray(certificados) ? certificados : []) {
    if (c?.matricula_id && !mapa.has(c.matricula_id)) mapa.set(c.matricula_id, c);
  }
  return mapa;
}
