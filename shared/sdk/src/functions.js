/**
 * Wrapper de Edge Functions compatível com base44.functions
 *
 * base44.functions.invoke(name, payload)  → POST /functions/v1/<name>
 *
 * O Base44 também aceita `base44.functions.<name>.invoke(payload)` em algumas
 * versões — implementamos os dois.
 */

export function createFunctions(supabase) {
  /**
   * Chamada principal: invoke(name, payload)
   */
  async function invoke(name, payload = {}) {
    const { data, error } = await supabase.functions.invoke(name, { body: payload });
    if (error) {
      // Edge Function pode retornar erro estruturado em data.error
      throw error;
    }
    return data;
  }

  // Proxy para suportar base44.functions.<name>.invoke(payload)
  // (caso o código faça isso em vez de base44.functions.invoke(name, payload))
  const proxy = new Proxy(
    { invoke },
    {
      get(target, prop) {
        if (prop === "invoke") return target.invoke;
        if (typeof prop !== "string") return undefined;
        // base44.functions.criarPreLancamento.invoke({...})
        return {
          invoke: (payload) => invoke(prop, payload),
        };
      },
    }
  );

  return proxy;
}
