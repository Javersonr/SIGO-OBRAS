import { useEmpresa } from '@/Layout';

export const useHoldingMode = () => {
  const { empresaAtiva, user, empresas, vinculo } = useEmpresa();

  const isHoldingMode = () => {
    return vinculo?.perfil === 'Admin Holding';
  };

  const getEmpresasAcesso = () => {
    return isHoldingMode() ? empresas : empresaAtiva ? [empresaAtiva] : [];
  };

  const getEmpresaIds = () => {
    return getEmpresasAcesso().map(e => e.id);
  };

  return {
    isHoldingMode: isHoldingMode(),
    empresasAcesso: getEmpresasAcesso(),
    empresaIds: getEmpresaIds(),
    empresaAtiva,
    user,
    vinculo
  };
};