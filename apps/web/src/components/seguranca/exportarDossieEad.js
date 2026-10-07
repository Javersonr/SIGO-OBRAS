import { supabase, resolveStorageUrl } from "@/api/sigoClient";
import { lerEmPaginas } from "@/lib/leitura-em-paginas";
import { montarDossie } from "@/lib/ead-dossie";
import { mensagemFalhaCertificado } from "@/lib/certificado-ead-falhas";
import { criarGeradorDeCertificado } from "@/components/seguranca/certificadoParaRH";

/**
 * Exporta o dossiê de fiscalização de um curso EAD (T34): lê o banco com a sessão do RH, monta o ZIP
 * (`lib/ead-dossie.js`) e entrega o arquivo ao navegador. Nada é gravado: o projeto pedagógico é baixado por
 * uma URL assinada criada na hora (nunca guardada) e os PDFs dos certificados são gerados aqui, no navegador.
 *
 * Toda leitura é de uma empresa só (`empresa_id` em cada consulta, além da RLS) e página por página (o
 * PostgREST corta qualquer resposta em 1000 linhas). Falha de leitura aborta a exportação (nunca sai um
 * dossiê pela metade sem aviso); leitura que bateu no limite de páginas entra no LEIA-ME como aviso.
 */

// ids por consulta `.in(...)`: o filtro vai na URL, e uns 80 UUIDs cabem folgados
const IDS_POR_CONSULTA = 80;
// a trilha do curso pode ter muitas linhas (play, pausa e saída da aba de cada aula de cada aluno)
const PAGINAS_DA_TRILHA = 500;
// a tentativa guarda a prova inteira em jsonb: páginas menores
const OPCOES_DAS_TENTATIVAS = { tamanho: 200, maxPaginas: 100 };

const COLUNAS_DO_EVENTO =
  "id, funcionario_id, matricula_id, curso_id, aula_id, evento, detalhe, ip, dispositivo, origem, created_at";
const COLUNAS_DO_FUNCIONARIO = "id, nome_completo, cpf, funcao_nome, ativo, deleted_at";
const COLUNAS_DA_AULA = "id, ordem, titulo, modulo, tipo, duracao_seg, deleted_at";
const COLUNAS_DO_PROGRESSO = "matricula_id, aula_id, segundos_assistidos, concluida";

const ROTULO_DA_ASSINATURA = {
  instrutor: "do instrutor",
  responsavel_tecnico: "do responsável técnico",
};

/** Lê as linhas de `ids` aos poucos (`montar(lote)` devolve a consulta do lote). */
async function lerPorLotes(ids, montar, opcoes) {
  const linhas = [];
  let truncado = false;
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) {
    const lote = await lerEmPaginas(() => montar(ids.slice(i, i + IDS_POR_CONSULTA)), opcoes);
    linhas.push(...lote.linhas);
    truncado = truncado || lote.truncado;
  }
  return { linhas, truncado };
}

/**
 * Tudo o que o dossiê do curso precisa, lido do banco. `leituraIncompleta` lista o que passou do limite de
 * páginas ("trilha", "tentativas", "progresso"...).
 */
export async function lerDadosDoDossie({ empresaId, cursoId }) {
  if (!supabase) throw new Error("Sem conexão com o banco de dados.");
  if (!empresaId || !cursoId) throw new Error("Curso ou empresa não informados.");
  const tabela = (nome, colunas = "*") =>
    supabase.from(nome).select(colunas).eq("empresa_id", empresaId);

  const [cursoLido, matriculas, aulas, tentativas, certificados] = await Promise.all([
    tabela("treinamento_curso").eq("id", cursoId).maybeSingle(),
    lerEmPaginas(() => tabela("treinamento_matricula").eq("curso_id", cursoId).order("id")),
    lerEmPaginas(() =>
      tabela("treinamento_aula", COLUNAS_DA_AULA).eq("curso_id", cursoId).order("id")
    ),
    lerEmPaginas(
      () => tabela("treinamento_tentativa").eq("curso_id", cursoId).order("id"),
      OPCOES_DAS_TENTATIVAS
    ),
    lerEmPaginas(() => tabela("treinamento_certificado").eq("curso_id", cursoId).order("id")),
  ]);
  if (cursoLido.error) throw cursoLido.error;
  if (!cursoLido.data) throw new Error("Curso não encontrado.");

  const idsDasMatriculas = matriculas.linhas.map((m) => m.id);
  const idsDosFuncionarios = [...new Set(matriculas.linhas.map((m) => m.funcionario_id))];
  const opcoesDaTrilha = { maxPaginas: PAGINAS_DA_TRILHA };
  const [funcionarios, progresso, eventosDasMatriculas, acessosAoPortal] = await Promise.all([
    lerPorLotes(idsDosFuncionarios, (ids) =>
      tabela("funcionario", COLUNAS_DO_FUNCIONARIO).in("id", ids).order("id")
    ),
    lerPorLotes(idsDasMatriculas, (ids) =>
      tabela("treinamento_progresso", COLUNAS_DO_PROGRESSO).in("matricula_id", ids).order("id")
    ),
    lerPorLotes(
      idsDasMatriculas,
      (ids) => tabela("treinamento_evento", COLUNAS_DO_EVENTO).in("matricula_id", ids).order("id"),
      opcoesDaTrilha
    ),
    // login, troca de senha e outros acessos de quem tem matrícula no curso (eventos sem matrícula)
    lerPorLotes(
      idsDosFuncionarios,
      (ids) =>
        tabela("treinamento_evento", COLUNAS_DO_EVENTO)
          .is("matricula_id", null)
          .in("funcionario_id", ids)
          .order("id"),
      opcoesDaTrilha
    ),
  ]);

  const leituraIncompleta = [];
  if (matriculas.truncado) leituraIncompleta.push("matriculas");
  if (tentativas.truncado) leituraIncompleta.push("tentativas");
  if (funcionarios.truncado) leituraIncompleta.push("funcionarios");
  if (progresso.truncado) leituraIncompleta.push("progresso");
  if (eventosDasMatriculas.truncado || acessosAoPortal.truncado) leituraIncompleta.push("trilha");

  return {
    curso: cursoLido.data,
    aulas: aulas.linhas,
    matriculas: matriculas.linhas,
    funcionarios: funcionarios.linhas,
    progresso: progresso.linhas,
    eventos: [...eventosDasMatriculas.linhas, ...acessosAoPortal.linhas],
    tentativas: tentativas.linhas,
    certificados: certificados.linhas,
    leituraIncompleta,
  };
}

/**
 * Quanto tempo o projeto pedagógico tem para baixar (A6). O PDF pode ser grande e a rede do RH lenta, então o
 * limite é de minutos; sem ele um download travado deixava "Montando os arquivos..." para sempre e todos os
 * botões "Exportar dossiê" desabilitados até recarregar a página.
 */
export const LIMITE_DO_PROJETO_MS = 120_000;

/**
 * Baixa o arquivo guardado no Storage (a URL assinada nasce aqui e some com a função), com limite de tempo
 * para a resposta INTEIRA (cabeçalho e corpo). Erros dizem a causa ("sem URL", "HTTP 404", "tempo esgotado").
 */
export async function lerArquivoDoStorage(ref, limiteMs = LIMITE_DO_PROJETO_MS) {
  const url = await resolveStorageUrl(ref);
  if (!url) throw new Error("sem URL");
  const controle = new AbortController();
  const temporizador = setTimeout(() => controle.abort(), limiteMs);
  try {
    const resposta = await fetch(url, { signal: controle.signal });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return await resposta.arrayBuffer();
  } catch (erro) {
    if (controle.signal.aborted) {
      throw new Error(`tempo esgotado (${Math.round(limiteMs / 1000)} s)`);
    }
    throw erro;
  } finally {
    clearTimeout(temporizador);
  }
}

/** Entrega o arquivo ao navegador (a URL do Blob só é liberada depois que o download começou). */
function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Lê o curso, monta o ZIP e baixa. Devolve o `resumo` da montagem (`lib/ead-dossie.js`) para o toast
 * (`avisoDoDossie`), ou null se `aindaVale()` disse que a tela mudou de empresa no meio (nada é baixado).
 * `aoProgredir({ etapa, feitos?, total? })` mostra o andamento na tela.
 *
 * @param {{ empresa: object, cursoId: string, geradoPor?: string, aoProgredir?: Function,
 *   aindaVale?: () => boolean }} pedido
 */
export async function exportarDossieDoCurso({
  empresa,
  cursoId,
  geradoPor,
  aoProgredir,
  aindaVale = () => true,
}) {
  aoProgredir?.({ etapa: "lendo" });
  const dados = await lerDadosDoDossie({ empresaId: empresa?.id, cursoId });
  const { default: JSZip } = await import("jszip");
  const gerarPdf = criarGeradorDeCertificado(empresa);

  const resultado = await montarDossie(
    { empresa, ...dados, geradoPor },
    {
      criarZip: () => new JSZip(),
      lerProjeto: lerArquivoDoStorage,
      gerarCertificado: async (certificado) => {
        let arquivo = null;
        try {
          const { faltaram } = await gerarPdf(certificado, (doc) => {
            arquivo = doc.output("arraybuffer");
          });
          return {
            arquivo,
            aviso: faltaram.length
              ? `sem a imagem da assinatura ${faltaram.map((k) => ROTULO_DA_ASSINATURA[k] ?? k).join(" e ")}`
              : "",
          };
        } catch (erro) {
          console.error("[dossie] falha ao gerar o certificado", certificado?.codigo, erro);
          // o texto vai para o LEIA-ME: a frase em português, não a mensagem da biblioteca de PDF
          throw new Error(mensagemFalhaCertificado(erro));
        }
      },
      aoProgredir,
    }
  );

  if (!aindaVale()) return null;
  baixarBlob(resultado.conteudo, resultado.nomeArquivo);
  return resultado.resumo;
}
