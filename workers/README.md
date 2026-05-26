# Workers — processos de longa duração

Functions que demoram >30s (Gemini batch, processamento de PDFs, importação de certificados, etc.) não cabem em Edge Functions. Vivem aqui e rodam no Railway.

Pode aproveitar o repositório existente do bot WhatsApp (Node ESM + Hono) como base — ele já tem deploy configurado para Railway.

## Estrutura prevista

```
workers/
├── ocr-worker/         # processar PDFs com IA, certificados com IA, importar certificados de funcionário
└── whatsapp-bot/       # bot atual (pode migrar para cá depois)
```

Cada worker é um app Node independente com seu próprio `package.json`.

Comunicação com Supabase: usa `@supabase/supabase-js` com a **service role key**. Lê jobs da tabela `worker_jobs`, processa, atualiza status.
