# GitHub Actions workflows

## `deploy-hostgator.yml`

Faz build do frontend e envia pra Hostgator via FTP a cada push em `master` que tocar `apps/web/**` ou `shared/sdk/**`.

### Secrets necessários no GitHub

Configurar em: **Settings → Secrets and variables → Actions → New repository secret**

| Nome                     | Valor                                      | Onde pegar                                             |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------ |
| `VITE_SUPABASE_URL`      | `https://fpyvdwpvxrubrkdwrqbs.supabase.co` | Já sabemos                                             |
| `VITE_SUPABASE_ANON_KEY` | chave anon (longa, JWT)                    | Supabase Dashboard → Settings → API → anon public      |
| `HOSTGATOR_FTP_HOST`     | ex: `ftp.sigoobras.com.br`                 | cPanel Hostgator → FTP Accounts                        |
| `HOSTGATOR_FTP_USER`     | conta FTP criada                           | cPanel → FTP Accounts (crie uma específica pra deploy) |
| `HOSTGATOR_FTP_PASS`     | senha da conta FTP                         | mesma página                                           |
| `HOSTGATOR_FTP_DIR`      | ex: `/public_html/`                        | onde o site mora no servidor                           |

### Como criar a conta FTP no Hostgator

1. cPanel → **FTP Accounts**
2. Login: `deploy@sigoobras.com.br` (ou só `deploy`)
3. Senha: gere uma forte (use o botão Generator)
4. Diretório: `public_html/` (ou subdir se quiser isolar)
5. Quota: ilimitada (ou 500 MB se quiser limitar)
6. Salve a senha em local seguro — vai pro GitHub Secret

### Como testar

1. Faça uma edição em `apps/web/src/App.jsx`
2. `git commit` + `git push origin master`
3. GitHub Actions → aba `Actions` → veja o workflow rodando
4. Acesse `https://sigoobras.com.br` em ~3 min e veja a mudança

### Disparar manualmente

GitHub UI → Actions → "Deploy frontend to Hostgator" → "Run workflow" → branch master → "Run workflow"

### Troubleshooting

| Erro                                        | Causa                                                   | Solução                                                                |
| ------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `530 Login authentication failed`           | FTP user/senha errados                                  | Re-conferir secrets                                                    |
| `dist/.htaccess ausente`                    | `public/.htaccess` não foi pro build                    | Verificar que `apps/web/public/.htaccess` existe                       |
| Build erro `VITE_SUPABASE_URL undefined`    | Secret não criado                                       | Adicionar no GitHub                                                    |
| Site sobe mas mostra 404 nas rotas internas | `.htaccess` não foi copiado OU `mod_rewrite` desativado | Conferir `.htaccess` no servidor; abrir ticket Hostgator se necessário |
| `429 Too Many Requests` no FTP              | Hostgator tem rate limit                                | Esperar uns minutos, ou reduzir `state-name` no workflow               |
