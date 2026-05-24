# Legacy — código original Base44 (apenas referência)

**NÃO rode nada daqui.** Esta pasta serve como spec de:

- `base44/entities/*.jsonc` — schema das 5 entities documentadas no snapshot (Ferramenta, HistoricoDocumentoAssinado, Oportunidade, ReservaMaterial, SolicitacaoCompra). As outras ~25-30 entities precisam ser exportadas via `tools/export-base44.mjs`.
- `base44/functions/<nome>/entry.ts` — 83 functions Deno. Servem como spec do que o backend precisa fazer. Cada uma será reescrita como:
  - Supabase Edge Function (se rápida e leve), ou
  - rota de um worker em `workers/` (se for processamento longo).

Ver `docs/ROADMAP.md` para a classificação completa.

## Quando apagar?

Só depois da migração completa estar em produção, validada por pelo menos 2 semanas. Até lá, é nossa fonte da verdade para o comportamento esperado.
