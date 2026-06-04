# Etapa 3 — Reabilitar a RLS — ✅ APLICADA E VALIDADA

> **JANELA CONCLUÍDA.** A RLS multi-tenant foi reativada em produção (migration
> `0048` via `supabase db push`) e validada: anon key vê 0 linhas, e os usuários
> logados continuam vendo os dados da própria empresa (validação funcional OK).
> Rollback disponível em `0048_rollback_disable_rls.sql` caso necessário.
> Restam só as Etapas 4–5 (hardening — ver fim do arquivo).
>
> _Histórico abaixo (preservado para referência da preparação da janela)._

## Onde paramos (Etapas 1 e 2 — feitas)

- **Etapa 1 (backend):** `login-custom` e `trocar-empresa` emitem sessão real do
  Supabase Auth com `app_metadata.empresa_id`. `alterar-senha`/`redefinir-senha-admin`
  espelham a senha no Auth. Deployado e testado.
- **Etapa 2 (front):** `aplicarSessao`/`encerrarSessao` no `sigoClient`; login,
  seleção de empresa e troca in-app aplicam a sessão; logout faz signOut.
  Publicado (commits `ebcd0ce` + `0225ade`).
- **Etapa 3b (portais):** fornecedor e cliente portados para Edge Functions
  service-role no Supabase (ver `## Etapa 3b` abaixo). Externos NÃO recebem
  sessão Supabase Auth — seguem `anon`, e todo acesso passa por function que
  valida a credencial e devolve só o escopo permitido. Isso destrava a RLS.
- **RLS:** **ON** — migration `0048` aplicada via `supabase db push`. Verificado:
  anon key vê **0** linhas em `transacao_financeira`/`oportunidade`/`projeto`/
  `cotacao_fornecedor`/`nota_fiscal_eletronica` (antes vazava tudo). Rollback
  pronto em `0048_rollback_disable_rls.sql` (desliga a RLS na hora se preciso).

## Diagnóstico do estado da RLS (via migrations, fonte de verdade)

| Item                                                | Situação                                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apply_tenant_rls(macro)` (0014)                    | liga RLS + cria `super_admin_all` + `tenant_isolation` (empresa_id = `current_empresa_id()`)                      |
| 0014 aplicou em                                     | ~110 tabelas com `empresa_id` (CRM, projetos, estoque, compras, ferramental, RH, financeiro, notif/chat…)         |
| Especiais 0014 (sem empresa_id)                     | `empresa`, `plano`, `proposta_comercial`; e `boleto_bancario` (empresa*id nullable, policies `blt*\*`)            |
| **0026**                                            | **só DESLIGOU** a RLS em todas as tabelas — **não dropou policies**. Logo as policies do 0014 continuam no banco. |
| Tabelas com `empresa_id` criadas **depois** da 0014 | **0027, 0028, 0031, 0033, 0034, 0035, 0036** → nunca receberam policy. **0041 (licitações)** já tem.              |
| `grupo_empresarial`, `profiles`                     | a 0014 **nunca** ligou RLS neles (ficam como estão; ver “Pendências”).                                            |

### A brecha que a 0048 fecha

As tabelas **fiscais/NFe** criadas depois da 0014 — incluindo **`certificado_empresa`**
e **`empresa_config_fiscal`** (guardam o certificado A1!) e **`nota_fiscal_eletronica`** —
têm `empresa_id` mas **nenhuma policy**. Hoje, com RLS off + anon key pública, são
LER/ESCREVER por qualquer um. A 0048 cria a policy padrão pra todas elas
automaticamente (loop dinâmico por `empresa_id`).

## O que a 0048 faz (resumo)

- **A.** Loop por toda tabela com `empresa_id`: liga RLS; se a tabela não tiver
  **nenhuma** policy, cria `super_admin_all` + `tenant_isolation`. (Preserva as do
  0014 e as nominais como `boleto_bancario`.) Cobre as lacunas pós-0014.
- **B.** Religa `empresa`, `plano`, `proposta_comercial` (policies já existem).
- **C.** Troca a policy de `usuario_empresa` por uma **por e-mail** do próprio JWT
  (senão a troca de empresa quebra — o usuário precisa ver seus vínculos em
  todas as empresas).
- **D.** Deixa de FORA (RLS off) as tabelas dos **portais externos**
  (`fornecedor_acesso`, `cliente_portal_usuario`, `token_cliente_oportunidade`).

## 🚧 Riscos abertos / pendências ANTES de aplicar

1. **Portais de Fornecedor e Cliente — RESOLVIDO na Etapa 3b.** Os portais foram
   portados para Edge Functions service-role (ver `## Etapa 3b`). Os externos
   seguem `anon` (sem sessão Auth, por design — uma sessão tenant-wide os deixaria
   ler o financeiro inteiro), e cada leitura/escrita passa por uma function que
   valida a credencial e devolve só o escopo. ⚠️ **Pré-requisito da janela:** as 6
   functions 3b precisam estar **deployadas** e o front 3b **publicado** ANTES de
   ligar a RLS; o segredo `PORTAL_TOKEN_SECRET` precisa estar setado. Ainda assim,
   **valide os dois portais logo após aplicar** e use o rollback se quebrar.

2. **`usuario_custom`** fica com `tenant_isolation` (empresa_id = atual). Login usa
   service role (ok). Telas de gestão de usuário que leem `usuario_custom` no
   client podem ver menos linhas — verificar em Configurações → Usuários.

3. **`grupo_empresarial` / `profiles`** seguem sem RLS (como na 0014). Se contiverem
   dado sensível cross-tenant, criar policy depois (não bloqueia a Etapa 3).

4. **Pré-checagem de vínculo no `Layout.handleSelectEmpresa`** (filtra
   `UsuarioEmpresa` pela empresa-alvo): passa a funcionar graças à policy “por
   e-mail” do item C. Sem ela, o switcher daria “Você não tem acesso”.

## Roteiro da janela (passo a passo)

1. **Horário de baixo uso.** Avisar os clientes se possível.
2. Confirmar **backup/PITR** no painel Supabase.
3. Confirmar pré-requisitos: front no ar + **pelo menos os usuários-teste de 2
   empresas relogados** (têm sessão).
4. **Apagar os usuários de teste** `test-authbridge@sigo.local` e
   `test-trocar@sigo.local` em Authentication → Users.
5. Copiar `0048_reenable_rls.sql` para `supabase/migrations/0048_reenable_rls.sql`
   e rodar `supabase db push` **OU** colar no SQL Editor e executar.
6. **Teste cross-tenant imediato** (critério de sucesso):
   - Logar como usuário da **empresa A** → confirma que vê só dados de A.
   - Logar como usuário da **empresa B** → vê só de B.
   - **REST direto com a anon key** (sem JWT): `GET /rest/v1/transacao_financeira`
     deve voltar **[]** (hoje volta tudo). Mesmo teste em `certificado_empresa`,
     `oportunidade`, `projeto`.
   - Trocar de empresa no app (usuário multi-empresa) → dados trocam junto.
   - Abrir o **portal do fornecedor** e o **portal do cliente** → confirmar se
     ainda carregam (risco aberto nº 1).
7. **Se algo quebrar:** rodar `0048_rollback_disable_rls.sql` (volta na hora ao
   estado atual). Investigar, corrigir, reagendar.

## Comando de verificação rápida (anon não enxerga nada)

```bash
# Deve voltar [] depois da 0048 (hoje volta linhas):
curl -s "$SUPABASE_URL/rest/v1/transacao_financeira?select=id&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

## Etapa 3b — Portais via Edge Functions (pré-requisito da RLS)

Os portais externos **nunca** recebem sessão Supabase Auth (uma sessão
`authenticated` com `app_metadata.empresa_id` os deixaria ler TODAS as tabelas da
empresa — financeiro, certificado A1). Em vez disso seguem `anon` e usam um
**token de portal assinado (HMAC, `_shared/portal-token.ts`)**; todo acesso a
dados passa por function service-role que valida a credencial e devolve só o
escopo. Base44 está obsoleto → estas functions também **substituem** as funções
legadas `autenticarFornecedor`/`carregarCotacaoFornecedor`/`salvarRespostaFornecedor`.

**Edge Functions novas:**

| Function                     | Credencial                           | Faz                                                                |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `portal-fornecedor-login`    | email + senha                        | valida `fornecedor_acesso`, rehash p/ bcrypt, emite `portal_token` |
| `portal-fornecedor-cotacoes` | `portal_token`                       | histórico de cotações do fornecedor                                |
| `portal-fornecedor-cotacao`  | `token` da participação              | carrega 1 cotação + enriquece código do item                       |
| `portal-fornecedor-resposta` | `token` da participação              | responder / impossível / upload                                    |
| `portal-cliente-dados`       | `token` magic-link OU `portal_token` | empresa+projeto+orçamento+cronograma+arquivos+notas+diário         |
| `portal-cliente-acao`        | idem                                 | upload de arquivo / adicionar nota (escopo re-derivado)            |

**login-custom:** perfil `Cliente` **não** recebe mais sessão tenant-wide —
recebe `portal_token` (HMAC, com `oportunidade_id = usuario_empresa.projeto_id`).

**Migration 0047** (real, aplicável agora): adiciona
`arquivo_oportunidade.enviado_por_cliente` (era coluna fantasma).

**Frontend:** `EntrarSistema`, `FornecedorLogin`, `HistoricoCotacoes`,
`AcessoFornecedor`, `ClientePortal` passam a chamar as functions acima
(`sigoClient` rewrite map). O modo **preview** do ClientePortal segue lendo
direto (é o admin logado — já é RLS-safe).

**Deploy 3b (antes da janela da RLS):**

1. ✅ FEITO — `PORTAL_TOKEN_SECRET` setado (`supabase secrets set`).
2. ✅ FEITO — `supabase functions deploy` das 6 functions + `login-custom`
   (`--no-verify-jwt`). Smoke tests dos endpoints OK (401/400 esperados).
3. ✅ FEITO — `supabase db push` aplicou a 0047 (coluna `enviado_por_cliente`).
4. ✅ FEITO — push do frontend (commits `7b6098a` + `24e102f`); deploy Hostgator
   concluído via lftp. Os portais já usam as novas functions.
5. ⏳ PENDENTE (validação do usuário) — testar os dois portais (login fornecedor +
   responder cotação; abrir link de cliente + ver dados + subir arquivo/nota)
   **com a RLS ainda OFF**.

Backend e front (1–4) já estão no ar. Só depois de 3b 100% validado (passo 5) é
que a janela da RLS (0048) fica segura.

## Depois da Etapa 3 (Etapas 4–5, do plano)

- **4.** Edge Functions param de confiar no `empresa_id` do body (validar JWT do
  chamador); CORS restrito a sigoobras.com.br.
- **5.** Remover grants a `anon` (`0031` v_nfe_resumo_mensal, `0034`
  criar_transferencia_atomica); tirar o fallback `perfil || "Admin"` no Layout;
  PermissionGate nas ações da Lista; sanitizar o `q`; validar protocolo de links.
