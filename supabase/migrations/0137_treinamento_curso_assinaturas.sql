-- 0137 — EAD (NR-1 1.7.1.1): imagem da assinatura do instrutor e do responsável técnico no curso (T29 do
-- handoff do Portal de Treinamento)
--
-- Por quê: o certificado do portal imprime só o nome e o registro do instrutor e do responsável técnico
-- (RT), sem assinatura. As imagens do catálogo antigo (Configurações) apontam todas para o Base44 (179
-- referências, todas mortas, 404), e o curso EAD não tinha onde guardar uma assinatura (0103: só nome,
-- qualificação e registro). Decisão D7 do Javerson (06/10/2026): vale a IMAGEM da assinatura (não
-- ICP-Brasil); o RH anexa de novo a imagem do instrutor e a do RT, na tela do curso.
--
-- O que guarda: a REFERÊNCIA "bucket/caminho" no bucket `assinaturas` (migração 0015; privado, só a pasta
-- da empresa), nunca URL assinada (expira em 1 h) e nunca link do Base44. Na emissão do certificado o
-- servidor copia a referência para `dados` do certificado (entra no hash, como o nome e o registro), e o
-- portal entrega ao aluno só URL assinada na hora de gerar o PDF. As colunas ficam no curso, junto do nome
-- e do registro que o certificado já congela dali: a imagem e o nome da mesma pessoa nunca vêm de lugares
-- diferentes. Certificado sem imagem continua saindo, só com nome e registro.
--
-- O CHECK repete no banco a regra do servidor (portal-funcionario/assinaturas.ts): só referência
-- `assinaturas/<empresa do curso>/...` de PNG ou JPEG, sem escapar da pasta, sem URL e sem Base44. Assim um
-- curso não aponta para a assinatura de outra empresa nem para link morto, nem por chamada direta à API.
-- Linhas existentes ficam com NULL e passam no CHECK.
--
-- Idempotente (add column if not exists; a restrição é recriada). Sem UPDATE de dados reais: nenhum curso
-- ganha assinatura sozinho, o RH anexa pela tela. Antes de apagar arquivo do bucket `assinaturas`, lembre
-- que certificado já emitido guarda a referência: a imagem de um certificado emitido não pode ser apagada.
--
-- Depois de aplicar: o RH anexa as imagens em RH & Segurança → Treinamentos → curso (campos "Assinatura do
-- instrutor" e "Assinatura do responsável técnico"). Publicar a função portal-funcionario (a emissão passa a
-- congelar a referência e o portal a devolver a URL assinada) e validar-certificado (a consulta pública
-- passa a devolver só nome e registro do RT).

begin;

alter table public.treinamento_curso
  add column if not exists instrutor_assinatura_ref text,
  add column if not exists responsavel_tecnico_assinatura_ref text;

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_instrutor_assinatura_ref_check;
alter table public.treinamento_curso
  add constraint treinamento_curso_instrutor_assinatura_ref_check
  check (
    instrutor_assinatura_ref is null
    or (
      split_part(instrutor_assinatura_ref, '/', 1) = 'assinaturas'
      and split_part(instrutor_assinatura_ref, '/', 2) = empresa_id::text
      and instrutor_assinatura_ref ~* '^assinaturas/[^/]+/([^/]+/)*[^/]+\.(png|jpe?g)$'
      and instrutor_assinatura_ref !~* 'base44\.'
      and instrutor_assinatura_ref !~ '(^|/)\.{1,2}(/|$)'
      and position('\' in instrutor_assinatura_ref) = 0
      and position(':' in instrutor_assinatura_ref) = 0
    )
  );

alter table public.treinamento_curso
  drop constraint if exists treinamento_curso_responsavel_tecnico_assinatura_ref_check;
alter table public.treinamento_curso
  add constraint treinamento_curso_responsavel_tecnico_assinatura_ref_check
  check (
    responsavel_tecnico_assinatura_ref is null
    or (
      split_part(responsavel_tecnico_assinatura_ref, '/', 1) = 'assinaturas'
      and split_part(responsavel_tecnico_assinatura_ref, '/', 2) = empresa_id::text
      and responsavel_tecnico_assinatura_ref ~* '^assinaturas/[^/]+/([^/]+/)*[^/]+\.(png|jpe?g)$'
      and responsavel_tecnico_assinatura_ref !~* 'base44\.'
      and responsavel_tecnico_assinatura_ref !~ '(^|/)\.{1,2}(/|$)'
      and position('\' in responsavel_tecnico_assinatura_ref) = 0
      and position(':' in responsavel_tecnico_assinatura_ref) = 0
    )
  );

comment on column public.treinamento_curso.instrutor_assinatura_ref is
  'Referência "assinaturas/<empresa>/..." da imagem (PNG/JPEG) da assinatura do instrutor; congelada em '
  'treinamento_certificado.dados na emissão. Nunca URL assinada nem link do Base44.';
comment on column public.treinamento_curso.responsavel_tecnico_assinatura_ref is
  'Referência "assinaturas/<empresa>/..." da imagem (PNG/JPEG) da assinatura do responsável técnico; '
  'congelada em treinamento_certificado.dados na emissão. Nunca URL assinada nem link do Base44.';

commit;

-- Conferência (só leitura): as duas colunas existem e quantos cursos vivos já têm cada imagem (0 na primeira
-- aplicação; sobe conforme o RH anexa pela tela).
select count(*) filter (where instrutor_assinatura_ref is not null) as cursos_com_assinatura_do_instrutor,
       count(*) filter (where responsavel_tecnico_assinatura_ref is not null) as cursos_com_assinatura_do_rt,
       count(*) as cursos
from public.treinamento_curso
where deleted_at is null;

select 'ok' as res;
