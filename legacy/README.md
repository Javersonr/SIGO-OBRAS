# Legacy — snapshot da plataforma anterior (apenas referência)

**NÃO rode nada daqui.** Esta pasta serve como spec do comportamento esperado e como fonte de verdade enquanto a migração não termina:

- `base44/entities/*.jsonc` — schema das 5 entities documentadas no snapshot inicial (Ferramenta, HistoricoDocumentoAssinado, Oportunidade, ReservaMaterial, SolicitacaoCompra). As outras ~25-30 entities entram via `tools/export-base44.mjs`.
- `base44/SCHEMA-COMPLETO-API.md` — inventário completo da API antiga (referência).
- ~~`base44/functions/<nome>/entry.ts`~~ — **REMOVIDAS** (83 functions Deno do Base44).
  A migração está em produção; o backend novo vive em `supabase/functions/` (Edge
  Functions) + RPCs nas migrations. As originais ficam no histórico do git se
  precisar consultar.

Ver `docs/ROADMAP.md` para a classificação completa.

> Nota: o subdiretório `base44/` mantém esse nome apenas para preservar links em documentos históricos e os comentários do `tools/export-base44.mjs`. Será removido junto com toda a pasta `legacy/` após a estabilização do novo ambiente.

## Quando apagar?

Só depois da migração completa estar em produção, validada por pelo menos 2 semanas. Até lá, é nossa fonte da verdade para o comportamento esperado.
