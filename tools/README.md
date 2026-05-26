# Tools — scripts utilitários

## `export-base44.mjs`

Script para exportar TUDO da plataforma anterior (100 entidades, dados, arquivos). Útil para gerar um snapshot completo antes do cutover.

```bash
cd <raiz-do-monorepo>
cp tools/.env.example tools/.env
# preencha BASE44_APP_ID, BASE44_API_KEY, BASE44_APP_BASE_URL
npm install --workspace=tools
npm run export:base44
```

Saída: `tools/dump/<entidade>.json` (1 arquivo por entity) + `tools/dump/_files/` (arquivos baixados).

**Atenção:** `tools/dump/` está no `.gitignore` — contém dados produtivos.

> O nome `export-base44.mjs` e as variáveis `BASE44_*` referenciam a API original da plataforma anterior, que ainda é a fonte do dump. Após a migração concluir, o script e as variáveis serão removidos.

---

## `seed-from-xlsx.mjs`

Importa o backup multi-empresa `backup_todas_empresas_*.xlsx` direto para o Supabase. Cada aba do xlsx tem o padrão `<NomeEmpresa>_<NomeEntidade>`. O script faz upsert preservando os UUIDs originais, agrupando por empresa.

```bash
cd <raiz-do-monorepo>/tools
# .env precisa de SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, XLSX_PATH
npm install
DRY_RUN=true npm run seed:from-xlsx   # validação sem escrever
npm run seed:from-xlsx                # de fato importa
```

**Pré-requisitos:**

- Migrations 0001-0013 aplicadas (schema completo)
- RLS desabilitada OU rodar com service role (já é o padrão)
- xlsx no caminho indicado em `XLSX_PATH`

**O que ele faz:**

1. Lê todas as ~56 abas do xlsx
2. Agrupa por empresa (prefix do nome da aba)
3. Para cada empresa, faz upsert em ordem topológica de FK:
   `empresa → catálogos → cadastros → estoque → projetos → financeiro → relacionados`
4. Mantém os UUIDs originais (campo `id`) para preservar FKs
5. Converte campos JSONB declarados (responsaveis_ids, permissoes, etc.) de string → objeto

**Limitações conhecidas:**

- Nomes de aba truncados pelo Excel (~15 chars): se faltar mapeamento, adicione em `ABA_TO_TABLE` no script
- Não baixa arquivos referenciados em URLs (use `export:base44` para isso)
- Não cria GrupoEmpresarial automaticamente — faça manual no painel Supabase se precisar
