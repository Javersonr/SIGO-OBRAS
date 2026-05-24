# Workers — processos de longa duração

Functions Base44 que demoram >30s (Gemini batch, processarPDFsComGemini, importarCertificadosFuncionario etc.) não cabem em Edge Functions. Vivem aqui e rodam no Railway.

Pode aproveitar o repositório existente `SIGO-WHATSAPP-BOT` (Node ESM + Hono) como base — ele já tem deploy configurado para Railway.

## Estrutura prevista

```
workers/
├── ocr-worker/         # processarPDFsComGemini, processarCertificadosComIA, importarCertificadosFuncionario
└── whatsapp-bot/       # bot atual (pode migrar para cá depois)
```

Cada worker é um app Node independente com seu próprio `package.json`.

Comunicação com Supabase: usa `@supabase/supabase-js` com a **service role key**. Lê jobs da tabela `worker_jobs`, processa, atualiza status.
