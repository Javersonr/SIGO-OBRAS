# Etapa 3 — Reabilitar a RLS (preparado, **não aplicado**)

> O passo sensível da fundação de segurança. Aqui está tudo pronto para a
> janela: a migration de reativação, o rollback e o roteiro de teste. **Nada
> nesta pasta foi aplicado em produção.** Os `.sql` estão fora de
> `supabase/migrations/` de propósito, pra um `supabase db push` acidental não
> ligar a RLS sem os pré-requisitos.

## Onde paramos (Etapas 1 e 2 — feitas)

- **Etapa 1 (backend):** `login-custom` e `trocar-empresa` emitem sessão real do
  Supabase Auth com `app_metadata.empresa_id`. `alterar-senha`/`redefinir-senha-admin`
  espelham a senha no Auth. Deployado e testado.
- **Etapa 2 (front):** `aplicarSessao`/`encerrarSessao` no `sigoClient`; login,
  seleção de empresa e troca in-app aplicam a sessão; logout faz signOut.
  Publicado (commits `ebcd0ce` + `0225ade`).
- **RLS:** continua **OFF** (migration 0026). A 0047 reverte isso.

## Diagnóstico do estado da RLS (via migrations, fonte de verdade)

| Item                                                | Situação                                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apply_tenant_rls(macro)` (0014)                    | liga RLS + cria `super_admin_all` + `tenant_isolation` (empresa_id = `current_empresa_id()`)                      |
| 0014 aplicou em                                     | ~110 tabelas com `empresa_id` (CRM, projetos, estoque, compras, ferramental, RH, financeiro, notif/chat…)         |
| Especiais 0014 (sem empresa_id)                     | `empresa`, `plano`, `proposta_comercial`; e `boleto_bancario` (empresa*id nullable, policies `blt*\*`)            |
| **0026**                                            | **só DESLIGOU** a RLS em todas as tabelas — **não dropou policies**. Logo as policies do 0014 continuam no banco. |
| Tabelas com `empresa_id` criadas **depois** da 0014 | **0027, 0028, 0031, 0033, 0034, 0035, 0036** → nunca receberam policy. **0041 (licitações)** já tem.              |
| `grupo_empresarial`, `profiles`                     | a 0014 **nunca** ligou RLS neles (ficam como estão; ver “Pendências”).                                            |

### A brecha que a 0047 fecha

As tabelas **fiscais/NFe** criadas depois da 0014 — incluindo **`certificado_empresa`**
e **`empresa_config_fiscal`** (guardam o certificado A1!) e **`nota_fiscal_eletronica`** —
têm `empresa_id` mas **nenhuma policy**. Hoje, com RLS off + anon key pública, são
LER/ESCREVER por qualquer um. A 0047 cria a policy padrão pra todas elas
automaticamente (loop dinâmico por `empresa_id`).

## O que a 0047 faz (resumo)

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

1. **Portais de Fornecedor e Cliente não têm sessão Supabase Auth.**
   `autenticarFornecedor` e os tokens de cliente **não** passam pela ponte Auth —
   esses usuários operam como `anon`. Com a RLS ligada, qualquer leitura que o
   portal faça **direto nas entidades** (cotações, solicitações, oportunidades do
   cliente…) volta **vazia**. → **Decisão necessária:** (a) bridgear fornecedor/
   cliente no Auth também (Etapa 3b), ou (b) rotear as leituras dos portais por
   Edge Functions com service role. Enquanto isso, as 3 tabelas de auth dos
   portais ficam de fora (skip-list da 0047), mas as **tabelas de negócio que o
   portal lê** (ex.: `cotacao_fornecedor`) **serão isoladas** — então **valide o
   portal logo após aplicar** e use o rollback se quebrar.

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
5. Copiar `0047_reenable_rls.sql` para `supabase/migrations/0047_reenable_rls.sql`
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
7. **Se algo quebrar:** rodar `0047_rollback_disable_rls.sql` (volta na hora ao
   estado atual). Investigar, corrigir, reagendar.

## Comando de verificação rápida (anon não enxerga nada)

```bash
# Deve voltar [] depois da 0047 (hoje volta linhas):
curl -s "$SUPABASE_URL/rest/v1/transacao_financeira?select=id&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

## Depois da Etapa 3 (Etapas 4–5, do plano)

- **4.** Edge Functions param de confiar no `empresa_id` do body (validar JWT do
  chamador); CORS restrito a sigoobras.com.br.
- **5.** Remover grants a `anon` (`0031` v_nfe_resumo_mensal, `0034`
  criar_transferencia_atomica); tirar o fallback `perfil || "Admin"` no Layout;
  PermissionGate nas ações da Lista; sanitizar o `q`; validar protocolo de links.
