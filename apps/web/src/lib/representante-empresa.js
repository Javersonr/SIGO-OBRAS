/**
 * Representante legal da empresa (Configurações → Empresa): conferência do CPF
 * no Salvar. A máscara do campo enquanto digita é a formatarCpf de lib/cpf, usada
 * direto no EmpresaTab. O representante assina a proposta de preços exportada
 * pelo orçamento das oportunidades (spec 2026-09-29 §10).
 *
 * O CPF é opcional; se informado, precisa ter os dígitos verificadores certos.
 * Grava formatado (000.000.000-00), como o resto do sistema grava CPF.
 */
import { formatarCpf, validarCpf } from "@/lib/cpf";

export const ERRO_CPF_REPRESENTANTE =
  "CPF do representante legal inválido. Corrija ou deixe em branco.";

const soDigitos = (valor) => String(valor ?? "").replace(/\D/g, "");
const texto = (valor) => String(valor ?? "").trim();

/**
 * Confere e normaliza os campos do representante antes do Salvar da aba Empresa.
 * Devolve uma cópia de `empresaData` (todas as chaves) com nome e cargo sem
 * espaços nas pontas e o CPF formatado, ou o erro quando o CPF é inválido.
 * @returns {{ ok: true, dados: object } | { ok: false, erro: string }}
 */
export function prepararRepresentanteEmpresa(empresaData) {
  const cpf = soDigitos(empresaData?.representante_cpf);
  if (cpf && !validarCpf(cpf)) return { ok: false, erro: ERRO_CPF_REPRESENTANTE };
  return {
    ok: true,
    dados: {
      ...empresaData,
      representante_nome: texto(empresaData?.representante_nome),
      representante_cargo: texto(empresaData?.representante_cargo),
      representante_cpf: cpf ? formatarCpf(cpf) : "",
    },
  };
}
