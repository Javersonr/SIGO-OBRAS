import { resolveStorageUrl } from "@/api/sigoClient";
import { baixarCertificadoPdf } from "@/lib/certificado-ead";
import { logoParaPdf, logoParaPdfDeUrl } from "@/lib/pdf-empresa";
import { assinaturasQueFaltaram, carregarAssinaturasDoCertificado } from "@/lib/ead-assinatura";
import { criarCacheSoDeSucesso } from "@/lib/cache-so-sucesso";

/**
 * Gerador do PDF do certificado EAD para a EQUIPE (RH): usa a própria sessão para assinar o logo e as imagens
 * de assinatura (o aluno recebe as URLs prontas do servidor). Serve à Ficha do funcionário (um certificado)
 * e ao dossiê do curso (todos os certificados do curso, T34).
 *
 * O logo e cada imagem de assinatura são carregados UMA vez por gerador: o dossiê gera dezenas de PDFs do
 * mesmo curso, que repetem as mesmas imagens. As URLs assinadas nascem na hora do uso e nunca são gravadas.
 * O cache guarda só o SUCESSO (`criarCacheSoDeSucesso`): uma queda de rede na primeira imagem não tira a
 * imagem de todo o lote, a próxima leitura tenta de novo (e desiste só se o arquivo falhar várias vezes).
 *
 * @param {object} empresaAtiva empresa que emite (só o logo é usado)
 * @returns {(certificado: object, salvar?: (doc: object, nome: string) => void)
 *   => Promise<{ faltaram: string[] }>}
 *   `faltaram`: quem ficou sem a imagem da assinatura no PDF ("instrutor", "responsavel_tecnico").
 *   Sem `salvar`, o PDF é baixado pelo navegador (jsPDF); com ele, quem chama recebe o `doc`.
 *   Falha prevista = `ErroCertificado` (`mensagemFalhaCertificado` dá o texto para o toast).
 */
export function criarGeradorDeCertificado(empresaAtiva) {
  const logoCarregado = criarCacheSoDeSucesso(() => logoParaPdf(empresaAtiva));
  const urlPorRef = criarCacheSoDeSucesso((ref) => resolveStorageUrl(ref));
  const imagemPorUrl = criarCacheSoDeSucesso((url) => logoParaPdfDeUrl(url));

  // empresa sem logo cadastrado não é falha: não há o que carregar (e nada a tentar de novo)
  const logoDaEmpresa = () => (empresaAtiva?.logo_url ? logoCarregado("logo") : null);
  const urlDe = (pessoa) => urlPorRef(pessoa?.assinatura_ref);
  const carregar = (url) => imagemPorUrl(url);

  return async function gerarPdfDoCertificado(certificado, salvar) {
    const logoDoPdf = await logoDaEmpresa();
    // a imagem da assinatura do instrutor e do RT é a referência congelada na emissão (T29)
    const carregadas = await carregarAssinaturasDoCertificado(certificado.dados, {
      urlDe,
      carregar,
    });
    const { assinaturasDesenhadas } = await baixarCertificadoPdf(
      { ...certificado, revogado: !!certificado.revogado_em },
      { logo: logoDoPdf, assinaturas: carregadas.imagens, ...(salvar ? { salvar } : {}) }
    );
    return { faltaram: assinaturasQueFaltaram(carregadas, assinaturasDesenhadas) };
  };
}
