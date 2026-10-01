# Treinamentos vinculados ao cadastro central

A migração 0131 foi reservada pelo Javerson em 01/10/2026. Aplicar a migração antes de publicar o frontend desta alteração.

## Comportamento

- O cadastro `treinamento` sem função e sem origem é o modelo central. As exigências de cada função continuam como registros próprios, ligados pelo campo `modelo_treinamento_id`.
- O curso EAD também aponta para esse modelo. Nome, código, carga horária, validade e conteúdo programático são herdados. Aulas, questões, nota mínima, tentativas, instrutor/qualificação e responsável técnico do EAD permanecem no curso.
- A alteração do modelo propaga os dados pedagógicos às funções e aos cursos na mesma transação, com filtro de empresa e RLS. Na cópia da função, editar um treinamento vinculado abre o modelo central e avisa que a edição afeta todos os vínculos.
- A obrigatoriedade de cada função, datas, anexos, matrícula e certificados emitidos não são substituídos. Alterar o catálogo não dá aprovação ao funcionário nem cria matrícula automática.
- Desativar o modelo desativa as cópias e cursos. Reativar o modelo não publica automaticamente um curso: o RH deve revisar seus requisitos.
- O modelo com vínculos não pode ser excluído ou transferido de empresa. Referências a outra empresa ou a uma cópia são recusadas pelo banco.
- O formulário de cursos permite preparar um curso diretamente do cadastro central e vincular cursos antigos. Novos cursos começam como rascunho; salvar exige escolher um modelo central.
- Na ficha TST, a exigência da função exibe o curso/matrícula/certificado correspondente do portal. Certificado emitido é informação de histórico; confira sua validade. A tela não declara aptidão automaticamente.
- Função sem treinamentos deixa de exibir todos os modelos da empresa como obrigatórios.

## Registros antigos

A migração vincula apenas correspondências únicas na mesma empresa, com código não vazio, nome e dados pedagógicos iguais. Nomes/códigos duplicados ou divergentes continuam pendentes.

Para revisar uma cópia antiga, abra seu editor e use **Vincular treinamento legado ao cadastro central**. Salvar esse vínculo recebe os dados do modelo, preservando as datas, anexos e exigência da função. Cursos antigos recebem o vínculo no editor em **RH & Segurança → Treinamentos**.

Se só existir uma cópia por função e nenhum modelo central, cadastre o modelo antes de vincular. Nenhuma fusão de treinamentos distintos é feita automaticamente.

## Verificação e publicação

Verificação local com dados sintéticos: testes das regras do catálogo, execução da migração em PostgreSQL embarcado (PGlite), idempotência, vínculos legados, propagação, proteção de origem, referências entre empresas e preservação de certificados. Conferência visual em 390 × 844 e 1440 × 900, além de lint, `no-undef`, formato e build.

Ordem de publicação:

1. Aplicar `supabase/migrations/0131_treinamentos_cadastro_integrado.sql` e conferir o retorno `ok`.
2. Publicar o commit do frontend. Não publicar antes da migração, pois os formulários passam a gravar o campo de vínculo.
3. O Javerson revisa os vínculos pendentes e testa um modelo, uma função e um curso no servidor. Nenhuma alteração em dados reais foi feita na preparação.

Esta alteração não exige deploy de Edge Function. As regras atuais do portal continuam validando duração, aulas e avaliação após qualquer alteração da carga horária no cadastro central.
