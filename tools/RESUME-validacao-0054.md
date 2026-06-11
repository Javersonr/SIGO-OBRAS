# Retomada — validação da migration 0054 (fix notificacao em Compras)

Status quando este arquivo foi escrito (2026-06-09):

- ✅ `supabase/migrations/0054_compras_aprovacao_fix_notificacao.sql` criada e
  conferida estaticamente (corpos das funções idênticos à 0028, só as 3 correções:
  `descricao`→`mensagem`, `link_destino`→`link`, `'AprovacaoCompra'`→`'Compra'`).
- ✅ `tools/smoke-compras-aprovacao.sql` criado (teste em transação com ROLLBACK).
- ✅ WSL2 instalado (`wsl --install`, exit=0). **Falta REINICIAR o Windows.**
- ⏳ Smoke test runtime e `supabase db push` **ainda NÃO executados**.

## Passos após reiniciar o Windows

```powershell
# 1. Confirmar que o WSL2 está ok
wsl --status
wsl -l -v            # deve listar Ubuntu (Version 2)

# 2. Subir Docker Desktop e esperar o engine
& "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# aguarde ~1-2 min; verifique:
docker info        # deve responder sem erro de pipe
```

```powershell
# 3. Subir a stack local do Supabase (aplica TODAS as migrations, incl. 0054)
cd C:\Users\javer\sigoobras-base
supabase start
#   se já tiver volume antigo / quiser refazer do zero:  supabase db reset
```

```powershell
# 4. Semear uma empresa mínima (o smoke test usa "a primeira empresa existente",
#    e o banco local sobe vazio). 'empresa' só exige a coluna nome.
docker exec supabase_db_sigoobras psql -U postgres -d postgres `
  -c "insert into public.empresa (nome) values ('SMOKE EMPRESA TESTE');"

# 5. Rodar o smoke test (copia p/ dentro do container p/ evitar problema de encoding)
docker cp tools\smoke-compras-aprovacao.sql supabase_db_sigoobras:/tmp/smoke.sql
docker exec supabase_db_sigoobras psql -U postgres -d postgres -f /tmp/smoke.sql
#   ESPERADO: várias linhas NOTICE e ao final:
#   "SMOKE TEST OK (3 inserts em notificacao validados)"
#   (tudo dentro de transação com ROLLBACK — nada persiste, nem a empresa do passo 4
#    é descartada; ela fica no banco local descartável, sem problema.)
```

```powershell
# 6. SÓ APÓS o smoke test passar e a revisão humana: aplicar em produção
cd C:\Users\javer\sigoobras-base
printf 'Y\n' | supabase db push        # (ou:  npm run supabase:db:push)
```

## Notas

- Container do Postgres local: `supabase_db_sigoobras` (project_id em config.toml).
- Se `supabase start` reclamar que migrations antigas falham com dados legados,
  lembre que o banco local sobe vazio — não há dados legados, então deve aplicar limpo.
- Limpeza opcional ao terminar: `supabase stop`; e remover os helpers
  `C:\Users\javer\wsl-install-helper.ps1` e `C:\Users\javer\wsl-install.log`.
