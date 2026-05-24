import { createContext, useContext } from 'react';

export const EmpresaContext = createContext(null);

export const useEmpresa = () => {
  const context = useContext(EmpresaContext);
  if (!context) {
    return { empresaAtiva: null, setEmpresaAtiva: () => {}, perfil: null, reloadEmpresaAtiva: () => {}, temPermissao: () => false };
  }
  return context;
};