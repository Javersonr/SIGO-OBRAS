/**
 * Falhas do PDF do certificado EAD (T15): erro com mensagem escrita para o aluno e a espera do QR.
 * Puro (sem DOM, sem sigoClient), com teste ao lado. Quem usa: lib/certificado-ead.js (lança),
 * components/portal-funcionario/CertificadoPortal.jsx e components/seguranca/MatriculaAuditoriaSheet.jsx
 * (mostram a mensagem).
 */

export const MSG_QR_FALHOU =
  "Não foi possível gerar o QR Code de validação do certificado. Tente de novo; se continuar, peça o PDF ao RH.";
export const MSG_PDF_FALHOU =
  "Não foi possível gerar o PDF do certificado. Tente de novo; se continuar, peça o PDF ao RH.";
export const MSG_SEM_BIBLIOTECA_PDF =
  "Não foi possível carregar o gerador de PDF. Verifique sua conexão com a internet e tente de novo.";
/** O PDF saiu, mas sem o logotipo (não carregou ou o formato não é aceito no PDF). */
export const AVISO_SEM_LOGO =
  "O PDF foi baixado sem o logotipo da empresa, que não pôde ser carregado. O restante do certificado e a validação pelo QR Code não mudam. Para baixar com o logotipo, atualize a página e baixe de novo; se continuar sem o logotipo, avise o RH.";

/** Falha prevista na geração do PDF. A `message` já está em português, pronta para o aluno ler. */
export class ErroCertificado extends Error {
  constructor(mensagem, codigo) {
    super(mensagem);
    this.name = "ErroCertificado";
    this.codigo = codigo || null;
  }
}

/**
 * Texto para o aluno (ou o RH) quando baixar o certificado falha. Só a falha prevista
 * (`ErroCertificado`) mostra a própria mensagem; qualquer outro erro vem da biblioteca de PDF ou do
 * navegador, em inglês e técnico, e vira a frase padrão.
 */
export function mensagemFalhaCertificado(erro) {
  return erro instanceof ErroCertificado ? erro.message : MSG_PDF_FALHOU;
}

const PASSO_PADRAO_MS = 25;
const LIMITE_PADRAO_MS = 3000;

/**
 * Repete `tentar()` a cada `passoMs` até ela devolver algo (valor verdadeiro) ou o `limiteMs` acabar
 * (devolve null). Serve à espera do QR, que é desenhado depois da renderização do React. `esperar(ms)`
 * entra por parâmetro para o teste não depender do relógio. O erro de `tentar` sobe.
 */
export async function aguardarResultado(
  tentar,
  {
    limiteMs = LIMITE_PADRAO_MS,
    passoMs = PASSO_PADRAO_MS,
    esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}
) {
  for (let gasto = 0; gasto < limiteMs; gasto += passoMs) {
    await esperar(passoMs);
    const resultado = tentar();
    if (resultado) return resultado;
  }
  return null;
}

/**
 * PNG (data URL) do canvas do QR, ou null se o QR ainda não foi desenhado. O `QRCodeCanvas` do
 * `qrcode.react` cria o canvas na renderização e só desenha num efeito logo depois, começando por
 * pintar o fundo de branco: um canvas ainda sem tamanho, sem contexto 2d ou com o 1º pixel
 * transparente (alfa 0) NÃO é o QR. Sem essa conferência saía um QR em branco no PDF. Erro do
 * navegador ao ler o canvas (proteção contra impressão digital) sobe para quem chamou.
 * Quem usa: `lib/certificado-ead.js` (dentro da espera de `aguardarResultado`).
 */
export function pngDoQrSePronto(canvas) {
  if (!canvas || !canvas.width) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx || ctx.getImageData(0, 0, 1, 1).data[3] === 0) return null;
  return canvas.toDataURL("image/png");
}
