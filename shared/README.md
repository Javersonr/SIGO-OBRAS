# Shared — código reaproveitado entre apps e workers

## `shared/sdk/`

SDK do frontend (`@sigoobras/sdk`) que conversa com Supabase preservando a superfície de API do cliente legado. Estratégia:

1. Exporta um objeto `sigo` com a MESMA superfície (`sigo.entities.X.filter()`, `sigo.functions.X.invoke()`, etc.) usada pelo frontend hoje.
2. Por baixo, fala com Supabase via `@supabase/supabase-js`.
3. Frontend muda apenas 1 linha de import:
   ```diff
   - import { base44 } from '@/api/base44Client'
   + import { sigo }   from '@sigoobras/sdk'
   ```

Isso permite migração GRADUAL (uma entidade de cada vez) sem reescrever centenas de chamadas.

## `shared/types/`

Tipos TypeScript gerados automaticamente do schema Supabase:

```bash
supabase gen types typescript --linked > shared/types/database.ts
```

Esses tipos são consumidos pelo frontend e pelos workers.
