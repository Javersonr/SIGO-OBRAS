/**
 * Responsável técnico (RT) da empresa (Configurações → Empresa): quem assina os documentos de SST que
 * exigem RT, como a Autorização Formal (NR-10/NR-33/NR-35) e o Direito de Recusa.
 *
 * O RT é da EMPRESA, e cada empresa cadastra o seu. Não existe RT padrão no código: o que não estiver
 * cadastrado sai no documento como uma linha para preencher à mão (LACUNA), nunca com o nome de alguém.
 *
 * Tudo é opcional no cadastro; o CPF, se informado, precisa ter os dígitos verificadores certos e é
 * gravado formatado (000.000.000-00), como o resto do sistema grava CPF.
 */
import { formatarCpf, validarCpf } from "@/lib/cpf";

export const ERRO_CPF_RESPONSAVEL_TECNICO =
  "CPF do responsável técnico inválido. Corrija ou deixe em branco.";

/** Linha em branco impressa no lugar do dado que a empresa ainda não cadastrou. */
export const LACUNA = "_______________________";

/** Conselho impresso quando o campo fica em branco. */
const CONSELHO_PADRAO = "CREA";

const soDigitos = (valor) => String(valor ?? "").replace(/\D/g, "");
const texto = (valor) => String(valor ?? "").trim();

/**
 * Confere e normaliza os campos do RT antes do Salvar da aba Empresa. Devolve uma cópia de `empresaData`
 * (todas as chaves) com os textos sem espaços nas pontas e o CPF formatado, ou o erro do CPF inválido.
 * @returns {{ ok: true, dados: object } | { ok: false, erro: string }}
 */
export function prepararResponsavelTecnico(empresaData) {
  const cpf = soDigitos(empresaData?.responsavel_tecnico_cpf);
  if (cpf && !validarCpf(cpf)) return { ok: false, erro: ERRO_CPF_RESPONSAVEL_TECNICO };
  return {
    ok: true,
    dados: {
      ...empresaData,
      responsavel_tecnico_nome: texto(empresaData?.responsavel_tecnico_nome),
      responsavel_tecnico_titulo: texto(empresaData?.responsavel_tecnico_titulo),
      responsavel_tecnico_conselho: texto(empresaData?.responsavel_tecnico_conselho),
      responsavel_tecnico_registro: texto(empresaData?.responsavel_tecnico_registro),
      responsavel_tecnico_cpf: cpf ? formatarCpf(cpf) : "",
    },
  };
}

/**
 * Dados do RT prontos para imprimir num documento. Campo sem cadastro vira LACUNA; `faltando` lista o que
 * a empresa ainda não preencheu (para a tela avisar) e `completo` diz se o documento sai sem lacuna.
 * @returns {{ nome: string, titulo: string, conselho: string, registro: string, cpf: string,
 *   completo: boolean, faltando: string[] }}
 */
export function responsavelTecnicoParaDocumento(empresa) {
  const nome = texto(empresa?.responsavel_tecnico_nome);
  const titulo = texto(empresa?.responsavel_tecnico_titulo);
  const conselho = texto(empresa?.responsavel_tecnico_conselho);
  const registro = texto(empresa?.responsavel_tecnico_registro);
  const cpf = soDigitos(empresa?.responsavel_tecnico_cpf);

  const faltando = [];
  if (!nome) faltando.push("nome");
  if (!titulo) faltando.push("título");
  if (!registro) faltando.push("registro");
  if (!cpf) faltando.push("CPF");

  return {
    nome: nome || LACUNA,
    titulo: titulo || LACUNA,
    conselho: conselho || CONSELHO_PADRAO,
    registro: registro || LACUNA,
    cpf: cpf ? formatarCpf(cpf) : LACUNA,
    completo: faltando.length === 0,
    faltando,
  };
}
