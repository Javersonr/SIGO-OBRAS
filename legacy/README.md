# Legacy — snapshot da plataforma anterior (apenas referência)

**NÃO rode nada daqui.** Esta pasta serve como spec do comportamento esperado e como fonte de verdade enquanto a migração não termina:

- `base44/entities/*.jsonc` — schema das 5 entities documentadas no snapshot inicial (Ferramenta, HistoricoDocumentoAssinado, Oportunidade, ReservaMaterial, SolicitacaoCompra). As outras ~25-30 entities entram via `tools/export-base44.mjs`.
- `base44/functions/<nome>/entry.ts` — 83 functions Deno originais. Servem como spec do que o backend novo precisa fazer. Cada uma será reescrita como:
  - Supabase Edge Function (se rápida e leve), ou
  - rota de um worker em `workers/` (se for processamento longo).

Ver `docs/ROADMAP.md` para a classificação completa.

> Nota: o subdiretório `base44/` mantém esse nome apenas para preservar links em documentos históricos e os comentários do `tools/export-base44.mjs`. Será removido junto com toda a pasta `legacy/` após a estabilização do novo ambiente.

## Quando apagar?

Só depois da migração completa estar em produção, validada por pelo menos 2 semanas. Até lá, é nossa fonte da verdade para o comportamento esperado.
