# 📚 Documentação do SIGO Obras

Índice de toda a documentação operacional e técnica.

## 🗺️ Por onde começar

### Se você quer **entender o projeto**:

1. [README raiz](../README.md) — visão geral, arquitetura, scripts
2. [ROADMAP.md](./ROADMAP.md) — onde estamos e pra onde vamos (9 fases)
3. [SCHEMA.md](./SCHEMA.md) — inventário das 100 entidades por domínio

### Se você quer **operar / deployar**:

1. [DEPLOY-SUPABASE.md](./DEPLOY-SUPABASE.md) — configurar o backend
2. [DEPLOY-HOSTGATOR.md](./DEPLOY-HOSTGATOR.md) — colocar o frontend no ar (oficial)
3. [CUTOVER-PASSO-A-PASSO.md](./CUTOVER-PASSO-A-PASSO.md) — guia clique-a-clique
4. [DNS-CHECKLIST-HOSTGATOR.md](./DNS-CHECKLIST-HOSTGATOR.md) — migração DNS sem quebrar email
5. [MIGRATION-CHECKLIST.md](./MIGRATION-CHECKLIST.md) — credenciais e decisões pendentes

### Se você quer **contribuir com código**:

1. [../CONTRIBUTING.md](../CONTRIBUTING.md) — setup, Conventional Commits, PRs
2. [../SECURITY.md](../SECURITY.md) — política de segurança
3. [../legacy/base44/SCHEMA-COMPLETO-API.md](../legacy/base44/SCHEMA-COMPLETO-API.md) — schema das 100 entidades Base44 (referência)

## 📂 Documentos por categoria

### Estratégia & Planejamento

| Documento                                          | Descrição                                   |
| -------------------------------------------------- | ------------------------------------------- |
| [ROADMAP.md](./ROADMAP.md)                         | 9 fases da migração com checkboxes          |
| [SCHEMA.md](./SCHEMA.md)                           | Modelo de dados — 100 entidades             |
| [MIGRATION-CHECKLIST.md](./MIGRATION-CHECKLIST.md) | Operacional: acessos, credenciais, decisões |

### Deploy & Infraestrutura

| Documento                                                  | Descrição                                           | Status    |
| ---------------------------------------------------------- | --------------------------------------------------- | --------- |
| [DEPLOY-SUPABASE.md](./DEPLOY-SUPABASE.md)                 | Backend: link, push migrations, buckets, auth, CORS | Oficial   |
| [DEPLOY-HOSTGATOR.md](./DEPLOY-HOSTGATOR.md)               | Frontend: cPanel, FTP, SSL, .htaccess               | Oficial   |
| [DEPLOY-CLOUDFLARE-PAGES.md](./DEPLOY-CLOUDFLARE-PAGES.md) | Frontend alternativo: Pages + custom domain         | Arquivado |
| [DNS-CHECKLIST-HOSTGATOR.md](./DNS-CHECKLIST-HOSTGATOR.md) | Lista exata dos registros DNS a migrar              | Oficial   |
| [CUTOVER-PASSO-A-PASSO.md](./CUTOVER-PASSO-A-PASSO.md)     | Guia operacional clique-a-clique                    | Oficial   |

### Referências técnicas (em `legacy/`)

| Documento                                                         | Descrição                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| [SCHEMA-COMPLETO-API.md](../legacy/base44/SCHEMA-COMPLETO-API.md) | Schema oficial das 100 entidades (Base44 API export) |
| [Functions Base44](../legacy/base44/functions/)                   | 83 functions Deno originais (referência para portar) |
| [Entities Base44](../legacy/base44/entities/)                     | 5 entities documentadas no zip (subset)              |

## 🔄 Convenções

- **Português (BR)** é o idioma padrão dos docs
- **Markdown** padrão (GitHub flavored)
- **Códigos/comandos** em blocos com syntax highlight (`bash`, `sql`, `js`, etc.)
- **Decisões** registradas com data e contexto na seção apropriada
- **Status** explícito no topo (Oficial / Arquivado / Rascunho)

## 📝 Como manter atualizado

Quando uma decisão muda:

1. Atualize o documento afetado
2. Marque a versão anterior como `ARQUIVADO` (não delete)
3. Linke pro novo do documento antigo, e vice-versa
4. Atualize o `CHANGELOG.md` se a mudança for relevante pra histórico
