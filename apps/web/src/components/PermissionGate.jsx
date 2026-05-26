import React from "react";
import { useEmpresa } from "../Layout";
import { Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Componente para controlar acesso baseado em permissões
 *
 * Uso:
 * <PermissionGate modulo="Financeiro" aba="Despesas" funcao="criar">
 *   <Button>Criar Despesa</Button>
 * </PermissionGate>
 *
 * Ou para verificar apenas módulo:
 * <PermissionGate modulo="Financeiro">
 *   <div>Conteúdo do módulo financeiro</div>
 * </PermissionGate>
 */
export default function PermissionGate({
  children,
  modulo,
  aba = null,
  funcao = null,
  fallback = null,
  showAlert = false,
}) {
  const { temPermissao, perfil } = useEmpresa();

  // Admin sempre tem acesso
  if (perfil === "Admin") {
    return <>{children}</>;
  }

  const hasPermission = temPermissao(modulo, aba, funcao);

  if (!hasPermission) {
    if (showAlert) {
      return (
        <Alert variant="destructive" className="my-4">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para acessar esta funcionalidade.
            {aba && ` (Módulo: ${modulo} → ${aba}${funcao ? ` → ${funcao}` : ""})`}
          </AlertDescription>
        </Alert>
      );
    }
    return fallback || null;
  }

  return <>{children}</>;
}

/**
 * Hook para verificar permissões de forma programática
 */
export function usePermission() {
  const { temPermissao, perfil } = useEmpresa();

  return {
    can: (modulo, aba = null, funcao = null) => {
      if (perfil === "Admin") return true;
      return temPermissao(modulo, aba, funcao);
    },
    isAdmin: perfil === "Admin",
  };
}
