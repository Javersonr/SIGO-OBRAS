# Shared — código reaproveitado entre apps e workers

## `shared/sdk/`

Wrapper que vai substituir `@base44/sdk` no frontend. Estratégia:

1. Exporta um objeto `base44` com a MESMA superfície de API (`base44.entities.X.filter()`, `base44.functions.X.invoke()`, etc.)
2. Por baixo, fala com Supabase via `@supabase/supabase-js`
3. Frontend muda apenas 1 linha de import:
   ```diff
   - import { base44 } from '@/api/base44Client'
   + import { base44 } from '@sigoobras/sdk'
   ```

Isso permite migração GRADUAL (uma entidade de cada vez) sem reescrever centenas de chamadas.

## `shared/types/`

Tipos TypeScript gerados automaticamente do schema Supabase:

```bash
supabase gen types typescript --linked > shared/types/database.ts
```

Esses tipos são consumidos pelo frontend e pelos workers.
