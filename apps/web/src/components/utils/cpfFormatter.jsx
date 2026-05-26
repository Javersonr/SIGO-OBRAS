// Formata CPF para o padrão brasileiro: 000.000.000-00
export const formatCPF = (value) => {
  if (!value) return "";

  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, "");

  // Limita a 11 dígitos
  const limited = numbers.slice(0, 11);

  // Aplica a máscara
  if (limited.length <= 3) return limited;
  if (limited.length <= 6) return `${limited.slice(0, 3)}.${limited.slice(3)}`;
  if (limited.length <= 9)
    return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6)}`;
  return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6, 9)}-${limited.slice(9)}`;
};

// Valida se o CPF tem o formato correto
export const isValidCPFFormat = (value) => {
  if (!value) return false;
  const cpf = value.replace(/\D/g, "");
  return cpf.length === 11;
};

// Remove formatação do CPF
export const removeCPFFormatting = (value) => {
  return value.replace(/\D/g, "");
};
