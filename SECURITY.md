# Security Policy

A segurança dos dados dos nossos clientes é prioridade máxima. Se você identificou uma vulnerabilidade, agradecemos a divulgação responsável.

## Como reportar uma vulnerabilidade

**Não abra issue pública.** Envie um email para **javersonr@gmail.com** com:

- Descrição da vulnerabilidade
- Passos para reproduzir
- Impacto potencial (qual dado/funcionalidade afetada)
- Sugestão de correção (se houver)
- Sua identificação (opcional, mas ajuda na comunicação)

Vamos responder em até **72 horas úteis** com uma confirmação de recebimento e uma estimativa de prazo para investigação.

## Versões suportadas

Apenas a branch `master` recebe correções de segurança. Não mantemos branches de versões anteriores.

## Princípios de segurança aplicados neste projeto

- **Row Level Security (RLS)** habilitada em todas as tabelas do Supabase, com isolamento por `empresa_id` extraído do JWT
- **Senhas e tokens sensíveis** nunca commitados (`.gitignore` previne; chave anon do Supabase é pública por design, RLS faz o resto)
- **Service role key** restrita a Edge Functions e ambientes administrativos
- **HTTPS forçado** em todos os ambientes de produção
- **Storage** com path-based tenant isolation (`<empresa_id>/...`)
- **Auditoria** via tabela `audit_log` para ações sensíveis

## Disclosure timeline

Após a correção, divulgaremos publicamente:

- Resumo da vulnerabilidade
- Versão/data corrigida
- Crédito ao reporter (se autorizado)

Damos pelo menos 30 dias para clientes atualizarem antes da divulgação pública.
