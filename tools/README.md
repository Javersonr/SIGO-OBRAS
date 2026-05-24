# Tools — scripts utilitários

## `export-base44.mjs`

Script para exportar TUDO do Base44 (entities, dados, arquivos). Pré-requisito para a Fase 1 da migração.

```bash
cd <raiz-do-monorepo>
cp tools/.env.example tools/.env
# preencha BASE44_APP_ID, BASE44_API_KEY, BASE44_APP_BASE_URL
npm install --workspace=tools
npm run export:base44
```

Saída: `tools/dump/<entidade>.json` (1 arquivo por entity) + `tools/dump/_files/` (arquivos baixados).

**Atenção:** `tools/dump/` está no `.gitignore` — contém dados produtivos.
