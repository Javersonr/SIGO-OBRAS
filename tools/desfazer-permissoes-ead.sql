-- ============================================================================
-- desfazer-permissoes-ead.sql — PLANO DE EMERGÊNCIA da migração 0147 (T33, permissões do EAD).
-- Volta o banco ao que era ANTES da 0147, sem mexer em dado: nenhuma linha de tabela é inserida, alterada ou apagada.
-- Spec: docs/superpowers/specs/2026-10-06-permissoes-ead-design.md, §9 ("bloco para desfazer").
--
-- QUANDO USAR: no passo 5 da ordem de produção (cabeçalho da 0147), se o tools/smoke-permissoes-ead.sql FALHAR logo
-- depois de aplicar a migração e antes de liberar o uso. Um erro de ambiente do smoke ("Nenhum funcionário ativo para
-- testar", funcionário de teste com documentos_rh_anexos ilegível) não é falha da migração: escolha outro funcionário
-- no passo 1 do smoke e rode de novo, sem desfazer. Depois de desfazer, o comportamento do banco é o de antes: qualquer usuário da empresa volta
-- a gravar curso, aula, questão e matrícula pela API (a tela antiga e a nova seguem funcionando, só sem a trava).
--
-- ATENÇÃO À ORDEM: rode este arquivo ANTES do push da tela (passo 6). Ele remove também as RPC portal_documento_publicar
-- e portal_documento_retirar, que o cartão "PDFs do Portal do Funcionário" da tela NOVA chama; com a tela nova já
-- publicada e este arquivo aplicado, publicar e retirar PDF dão erro de função inexistente (nenhum dado se perde).
-- Nesse caso, aplique a 0147 de novo depois de corrigir o que fez o smoke falhar.
--
-- O que desfaz (tudo o que a 0147 criou ou trocou):
--   1. os 8 triggers zz_permissao_ead (curso, aula, questão, matrícula, dúvida, sessão prática, participante da
--      prática e texto da declaração) e o zz_documentos_portal (funcionario);
--   2. as 3 policies restritivas de leitura (questão, tentativa e evento) e as 3 do Storage (insert, update, delete);
--   3. as funções novas: zz_permissao_ead, zz_documentos_portal, portal_documento_publicar, portal_documento_retirar,
--      portal_documento_funcionario, anexos_do_portal, anexos_como_lista, tem_permissao e permissoes_como_objeto;
--   4. matricula_andamento_so_servidor volta ao texto da 0130 (tentativas_extras livre) e certificado_so_revogacao ao
--      da 0119 (UPDATE só para revogar); a policy tenant_revogar volta como na 0103 e authenticated volta a ter UPDATE
--      no certificado (a trava de coluna é a do trigger).
--
-- Como rodar (o Javerson ou o controlador; uma transação só: se algo falhar, nada muda):
--   supabase db query --linked -f tools/desfazer-permissoes-ead.sql
-- No fim aparece a tabela de conferência (esperado em cada coluna) e a linha "ok".
--
-- Idempotente: drop ... if exists, create or replace e grant repetíveis; rodar duas vezes dá o mesmo resultado.
-- O teste supabase/functions/funcionario-acesso/migracao-0147-desfazer.test.ts compara este arquivo com a 0147 (todo
-- trigger, policy e função criados lá têm o drop aqui) e com a 0119, a 0130 e a 0103 (o texto restaurado).
-- ============================================================================

begin;
set local lock_timeout = '10s';

-- 1. triggers (primeiro: depois deles nenhuma linha passa mais pelas funções novas) --------------------------------

drop trigger if exists zz_permissao_ead on public.treinamento_curso;
drop trigger if exists zz_permissao_ead on public.treinamento_aula;
drop trigger if exists zz_permissao_ead on public.treinamento_questao;
drop trigger if exists zz_permissao_ead on public.treinamento_matricula;
drop trigger if exists zz_permissao_ead on public.treinamento_duvida;
drop trigger if exists zz_permissao_ead on public.treinamento_sessao_pratica;
drop trigger if exists zz_permissao_ead on public.treinamento_pratica_participante;
drop trigger if exists zz_permissao_ead on public.treinamento_declaracao_texto;
drop trigger if exists zz_documentos_portal on public.funcionario;

-- 2. policies (antes das funções: as policies chamam tem_permissao e o Postgres não deixa derrubar a função em uso) --

drop policy if exists ead_leitura_com_permissao on public.treinamento_questao;
drop policy if exists ead_leitura_com_permissao on public.treinamento_tentativa;
drop policy if exists ead_leitura_com_permissao on public.treinamento_evento;
drop policy if exists treinamentos_insert_com_permissao on storage.objects;
drop policy if exists treinamentos_update_com_permissao on storage.objects;
drop policy if exists treinamentos_delete_com_permissao on storage.objects;

-- 3. funções novas (quem chama antes de quem é chamado) -------------------------------------------------------------

drop function if exists public.zz_permissao_ead();
drop function if exists public.zz_documentos_portal();
drop function if exists public.portal_documento_publicar(uuid, text, text, text, text);
drop function if exists public.portal_documento_retirar(uuid, text);
drop function if exists public.portal_documento_funcionario(uuid);
drop function if exists public.anexos_do_portal(jsonb, boolean);
drop function if exists public.anexos_como_lista(jsonb);
drop function if exists public.tem_permissao(text, text, text);
drop function if exists public.permissoes_como_objeto(jsonb);

-- 4. o que a 0147 trocou: volta ao texto de antes ------------------------------------------------------------------

-- como na 0130 (tentativas_extras entre as colunas livres); o trigger matricula_andamento_so_servidor continua ligado
create or replace function public.matricula_andamento_so_servidor()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() não é executável por authenticated (0110)
set search_path = public
as $$
declare
  -- o que a empresa pode mudar numa matrícula existente (deleted_at = excluir)
  livres constant text[] := array['tentativas_extras', 'deleted_at', 'updated_at'];
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- andamento e conclusão nascem zerados: quem grava é o portal-funcionario
    new.status := 'pendente';
    new.iniciado_em := null;
    new.data_conclusao := null;
    new.proxima_renovacao := null;
    new.nota_avaliacao := null;
    new.avaliacao_aprovada := null;
    new.avaliacao_em := null;
    new.created_at := now(); -- sem início retroativo no certificado
    new.updated_at := now();
    return new;
  end if;

  if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
    raise exception 'Acesso negado: andamento e conclusão do treinamento só pelo Portal do Funcionário'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.matricula_andamento_so_servidor() from public, anon, authenticated;

-- como na 0119 (o UPDATE só pode revogar: revogado_em, revogado_por, motivo_revogacao); o trigger
-- certificado_so_revogacao continua ligado
create or replace function public.certificado_so_revogacao()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() não é executável por authenticated (0110)
set search_path = public
as $$
declare
  livres constant text[] := array['revogado_em', 'revogado_por', 'motivo_revogacao', 'updated_at'];
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return new;
  end if;

  if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
    raise exception 'Acesso negado: certificado emitido não pode ser alterado (só revogado)'
      using errcode = '42501';
  end if;

  if old.revogado_em is not null
     and (new.revogado_em, new.revogado_por, new.motivo_revogacao)
         is distinct from (old.revogado_em, old.revogado_por, old.motivo_revogacao) then
    raise exception 'Acesso negado: certificado já revogado' using errcode = '42501';
  end if;

  if new.revogado_em is null and old.revogado_em is null
     and (new.revogado_por, new.motivo_revogacao)
         is distinct from (old.revogado_por, old.motivo_revogacao) then
    raise exception 'Acesso negado: informe a data da revogação' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.certificado_so_revogacao() from public, anon, authenticated;

-- como na 0103 (o drop antes do create deixa o arquivo repetível)
drop policy if exists tenant_revogar on public.treinamento_certificado;
create policy tenant_revogar on public.treinamento_certificado for update
  using (empresa_id = public.current_empresa_id())
  with check (empresa_id = public.current_empresa_id());
grant update on public.treinamento_certificado to authenticated;

commit;

-- Conferência (só leitura): o banco depois de desfazer. Esperado: triggers_zz = 0, policies_ead = 0,
-- policies_storage = 0, funcoes_novas = 0, tenant_revogar = 1, certificado_update_authenticated = true,
-- matricula_com_tentativas_extras = true, certificado_so_revoga = true.
select (select count(*) from pg_trigger
         where not tgisinternal and tgname in ('zz_permissao_ead', 'zz_documentos_portal')) as triggers_zz,
       (select count(*) from pg_policies
         where schemaname = 'public' and policyname = 'ead_leitura_com_permissao') as policies_ead,
       (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname in ('treinamentos_insert_com_permissao', 'treinamentos_update_com_permissao',
                              'treinamentos_delete_com_permissao')) as policies_storage,
       (select count(*) from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('zz_permissao_ead', 'zz_documentos_portal', 'portal_documento_publicar',
                           'portal_documento_retirar', 'portal_documento_funcionario', 'anexos_do_portal',
                           'anexos_como_lista', 'tem_permissao', 'permissoes_como_objeto')) as funcoes_novas,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'treinamento_certificado'
           and policyname = 'tenant_revogar') as tenant_revogar,
       has_table_privilege('authenticated', 'public.treinamento_certificado', 'UPDATE')
         as certificado_update_authenticated,
       (select pg_get_functiondef(p.oid) like '%''tentativas_extras'', ''deleted_at''%'
          from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.proname = 'matricula_andamento_so_servidor')
         as matricula_com_tentativas_extras,
       (select pg_get_functiondef(p.oid) like '%certificado emitido não pode ser alterado%'
          from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.proname = 'certificado_so_revogacao')
         as certificado_so_revoga;

select 'ok' as res;
