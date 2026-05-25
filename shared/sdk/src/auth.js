/**
 * Wrapper de auth compatível com base44.auth
 *
 * base44.auth.me()      → { id, email, nome_completo, perfil, empresa_id, empresa_nome, ... }
 * base44.auth.logout()  → signOut
 * base44.auth.login()   → não implementado aqui (faça via Edge Function loginCustom
 *                         para preservar a lógica multi-empresa do Base44)
 */

export function createAuth(supabase) {
  return {
    /**
     * Retorna dados do usuário logado, incluindo profile + vínculo de empresa atual.
     * Formato compatível com base44.auth.me().
     */
    async me() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const err = new Error("Usuário não autenticado");
        err.code = "NOT_AUTHENTICATED";
        throw err;
      }

      // Pega profile (extras como dashboard_config, role)
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      // empresa_id e is_super_admin vêm do JWT app_metadata
      const meta = user.app_metadata || {};

      return {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || user.user_metadata?.full_name,
        nome_completo: profile?.full_name || user.user_metadata?.full_name,
        telefone: profile?.telefone,
        role: profile?.role || "user",
        dashboard_config: profile?.dashboard_config,
        is_super_admin: !!meta.is_super_admin,
        empresa_id: meta.empresa_id,
        empresa_nome: meta.empresa_nome,
        perfil: meta.perfil,
        tipo_usuario: meta.tipo_usuario,
        // Compat com Base44
        created_date: user.created_at,
      };
    },

    /**
     * Desloga e limpa a sessão local.
     */
    async logout() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true };
    },

    /**
     * Helper: status da sessão atual (não-bloqueante)
     */
    async getSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },

    /**
     * Helper: subscribe a mudanças de auth
     */
    onAuthStateChange(callback) {
      return supabase.auth.onAuthStateChange(callback);
    },
  };
}
