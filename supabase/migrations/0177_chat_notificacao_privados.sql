-- ============================================================================
-- 0177 — Lote 2b-1 (F-09, varredura nov/2026): conversa "Direto" só para quem
-- participa, quem criou e o administrador; notificação só para o destinatário
--
-- FURO: canal_chat, mensagem_chat e notificacao tinham só a policy da empresa FOR
-- ALL: qualquer usuário lia todas as conversas (inclusive as diretas entre duas
-- pessoas) e todas as notificações dos colegas, podia apagar fisicamente canal e
-- mensagens de todos, reescrever mensagem alheia e esconder um canal "Geral"
-- transformando-o em "Direto".
--
-- DECISÃO DO DONO (23/11): o administrador PODE ler as conversas diretas.
--
-- QUEM USA HOJE (levantado no código):
--   * canal_chat: pages/Chat.jsx:32/67 e chat/ChatPanel.jsx:32/61 listam os canais
--     da empresa e filtram NO NAVEGADOR por `participantes.includes(user.id)` ou
--     tipo "Geral" (Chat.jsx:47-49, ChatPanel.jsx:47-48); `user.id` é o id de
--     usuario_custom (login-custom/index.ts:324-326); chat/NovoCanal.jsx:63-81 cria
--     (no "Direto" a lista de ids é só a dos escolhidos, `u.usuario_id || u.id` de
--     usuario_empresa, e a de e-mails sai da mesma lista); chat/ChatContextual.jsx:
--     63/94/128 (canal de Projeto/Oportunidade/Solicitação/Tarefa, COMPARTILHADO por
--     quem abre o registro); ChatWindow.jsx:80 e ChatContextual.jsx:128 só mudam
--     ultima_mensagem/ultima_mensagem_data;
--   * mensagem_chat: ChatContextual.jsx:101/117, ChatWindow.jsx:32/50/77 (lista,
--     marca lida_por, cria);
--   * notificacao: NotificationsPanel.jsx:86/105/166/211/239/251 e Layout.jsx:295,
--     sempre pelo e-mail do usuário; ChatWindow.jsx:97 cria notificação para OUTRO
--     usuário (menção) com insert(...).select() do SDK;
--   * nenhuma tela faz DELETE físico (o SDK só faz exclusão lógica) nem muda tipo/
--     participantes de canal ou texto de mensagem; funções do banco inserem
--     notificação sem RETURNING; Edge Functions não usam estas tabelas.
--
-- AGORA (revisão do Lote 2, achados 3, 5, 6 e 7, e revisão do 2b-1, achados 1, 5, 6,
-- 7 e 14):
--   * canal_chat: lê/altera quem é da empresa E (canal não é "Direto", ou o usuário
--     está na lista de participantes — por e-mail OU pelos ids que a tela usa, ou o
--     id do Auth —, ou criou o canal, ou é administrador). "Direto" antigo sem e-mail
--     não some para quem a tela já mostrava. Trigger canal_chat_autor grava
--     created_by = auth.uid() no INSERT feito por authenticated;
--   * mensagem_chat: só nos canais que o usuário vê; no INSERT (mensagem_chat_autor),
--     e-mail, usuario_id, usuario_nome e data vêm do login — os mesmos valores que a
--     tela já manda, então nada muda nela;
--   * campos protegidos, UMA FUNÇÃO POR TABELA (o PL/pgSQL resolve NEW.<campo>
--     contra a tabela do trigger; função compartilhada dava 42703 e quebrava todo
--     UPDATE de quem não é administrador): canal_chat_campos_protegidos — tipo,
--     participantes, autor, ativo e exclusão lógica só pelo criador ou administrador;
--     mensagem_chat_campos_protegidos — texto, autor, anexo, menções, data e exclusão
--     lógica só pelo autor ou administrador; lida_por, nome do canal e "última
--     mensagem" seguem livres para quem vê;
--   * notificacao: ler = do próprio e-mail, OU criada pelo próprio usuário nos
--     últimos 2 minutos (só para o RETURNING da menção); o created_at do INSERT é
--     do servidor (notificacao_autor), para a janela não ser forjada; alterar = só as
--     do próprio e-mail; criar continua aberto à empresa;
--   * DELETE físico e TRUNCATE saem de authenticated nas três.
--   super_admin_all fica nas três.
--
-- FORA: impedir notificação falsa para outro usuário criada pela API (a menção
-- teria de ir para o servidor: muda ChatWindow.jsx:91-110).
--
-- Antes de aplicar, a contagem de "Direto" que ficaria só para o administrador está
-- em LOTE2-banco.md (2b-1).
--
-- Deploy: depois da 0176 (usa usuario_eh_administrador; recria igual se faltar).
--   supabase db query --linked -f supabase/migrations/0177_chat_notificacao_privados.sql
-- Teste: tools/smoke-lote2-i-chat-notificacao.sql (termina em ROLLBACK).
-- ============================================================================

begin;
-- Se der "canceling statement due to lock timeout" (tabela ocupada), é só rodar de novo.
set local lock_timeout = '10s';

-- 0. administrador (igual à 0176; idempotente) ---------------------------------
create or replace function public.usuario_eh_administrador()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return true;
  end if;
  if auth.uid() is null or coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    return false;
  end if;
  -- SUPOSIÇÃO (dúvida em aberto do dono, ponto único): administrador = perfil Admin ou
  -- Admin Holding; o dono da conta (is_owner) com outro perfil NÃO conta. Para contar,
  -- acrescente "or ue.is_owner is true" abaixo. ativo nulo = ativo, como em
  -- current_user_perfil(), na RLS e no front (Layout.jsx:578).
  return exists (
    select 1
      from public.usuario_empresa ue
     where lower(ue.usuario_email) = public.current_user_email()
       and ue.empresa_id = public.current_empresa_id()
       and coalesce(ue.ativo, true) = true
       and ue.deleted_at is null
       and ue.perfil in ('Admin', 'Admin Holding')
  );
end;
$$;
revoke all on function public.usuario_eh_administrador() from public, anon, authenticated;
grant execute on function public.usuario_eh_administrador() to authenticated, service_role;

-- 1. os ids do usuário logado, como a tela os grava em participantes ------------
-- usuario_custom.id (o user.id do login), usuario_empresa.id e .usuario_id, e o próprio
-- auth.uid() (revisão 2b-1, achado 14: "Direto" que guardou o id do Auth). SECURITY
-- DEFINER: usuario_custom é só do servidor (0117). Responde só sobre o chamador.
create or replace function public.chat_meus_ids()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x.id), '{}'::text[])
    from (
      select auth.uid()::text as id
       where auth.uid() is not null
      union all
      select uc.id::text
        from public.usuario_custom uc
       where auth.uid() is not null
         and uc.deleted_at is null
         and (uc.auth_user_id = auth.uid() or lower(uc.email) = public.current_user_email())
      union all
      select ue.id::text
        from public.usuario_empresa ue
       where ue.empresa_id = public.current_empresa_id()
         and lower(ue.usuario_email) = public.current_user_email()
         and ue.deleted_at is null
      union all
      select ue.usuario_id::text
        from public.usuario_empresa ue
       where ue.empresa_id = public.current_empresa_id()
         and lower(ue.usuario_email) = public.current_user_email()
         and ue.deleted_at is null
         and ue.usuario_id is not null
    ) x;
$$;
revoke all on function public.chat_meus_ids() from public, anon, authenticated;
grant execute on function public.chat_meus_ids() to authenticated, service_role;

-- 1b. o login do chamador em usuario_custom (id e nome, como a tela manda) --------
-- A tela grava usuario_id = user.id e usuario_nome = user.full_name, que vêm de
-- usuario_custom (login-custom/index.ts:324-327; sigoClient.js:121-124). SECURITY
-- DEFINER pelo mesmo motivo de chat_meus_ids; responde só sobre o chamador.
-- Critério (revisão 2b-1, achado 19), o mesmo do login (login-custom/index.ts:141-153:
-- e-mail, deleted_at nulo, ativo): ignora login apagado; com e-mail repetido escolhe o
-- ligado ao Auth do token, depois o ativo, depois o mais antigo.
create or replace function public.chat_meu_login(out o_id uuid, out o_nome text)
language sql
stable
security definer
set search_path = public
as $$
  select uc.id, uc.nome_completo
    from public.usuario_custom uc
   where auth.uid() is not null
     and uc.deleted_at is null
     and (uc.auth_user_id = auth.uid() or lower(uc.email) = public.current_user_email())
   order by (uc.auth_user_id = auth.uid()) desc nulls last,
            coalesce(uc.ativo, true) desc,
            uc.created_at asc,
            uc.id
   limit 1;
$$;
revoke all on function public.chat_meu_login() from public, anon, authenticated;
grant execute on function public.chat_meu_login() to authenticated, service_role;

-- 2. quem vê o canal (invoker; os dados do chamador chegam por parâmetro) ---------
-- participantes e participantes_emails podem estar gravados como string JSON (o
-- front manda JSON.stringify): jsonb_to_array normaliza (0030).
create or replace function public.canal_chat_visivel(
  p_tipo text,
  p_participantes jsonb,
  p_participantes_emails jsonb,
  p_created_by uuid,
  p_meus_ids text[],
  p_admin boolean
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_tipo is distinct from 'Direto'
      or coalesce(p_admin, false)
      or (p_created_by is not null and p_created_by = auth.uid())
      or exists (
           select 1
             from jsonb_array_elements(public.jsonb_to_array(p_participantes_emails)) e
            where jsonb_typeof(e.value) = 'string'
              and lower(e.value #>> '{}') = public.current_user_email()
         )
      or exists (
           select 1
             from jsonb_array_elements(public.jsonb_to_array(p_participantes)) e
            where jsonb_typeof(e.value) = 'string'
              and (e.value #>> '{}') = any (coalesce(p_meus_ids, '{}'::text[]))
         );
$$;
revoke all on function public.canal_chat_visivel(text, jsonb, jsonb, uuid, text[], boolean) from public, anon;
grant execute on function public.canal_chat_visivel(text, jsonb, jsonb, uuid, text[], boolean) to authenticated, service_role;


-- 3. autores pelo token (uma função por tabela: o PL/pgSQL resolve NEW.<campo>
--    contra a tabela do trigger, e função compartilhada com campos de outra tabela
--    dá 42703 — revisão 2b-1, achado 1). Não são SECURITY DEFINER: só leem o JWT e
--    chamam auxiliares que authenticated executa. Valem quando quem grava é o
--    usuário logado (dentro de função definer o papel é o dono e nada muda).
drop trigger if exists chat_autor on public.canal_chat;
drop trigger if exists chat_autor on public.notificacao;
drop trigger if exists chat_autor on public.mensagem_chat;
drop function if exists public.chat_autor();

create or replace function public.canal_chat_autor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.canal_chat_autor() from public, anon;
grant execute on function public.canal_chat_autor() to authenticated, service_role;

drop trigger if exists canal_chat_autor on public.canal_chat;
create trigger canal_chat_autor before insert on public.canal_chat
  for each row execute function public.canal_chat_autor();

-- notificação: autor e data pelo servidor (a janela de 2 minutos do remetente não
-- pode depender de created_at escolhido pelo cliente — revisão 2b-1, achado 6)
create or replace function public.notificacao_autor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and auth.uid() is not null then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.notificacao_autor() from public, anon;
grant execute on function public.notificacao_autor() to authenticated, service_role;

drop trigger if exists notificacao_autor on public.notificacao;
create trigger notificacao_autor before insert on public.notificacao
  for each row execute function public.notificacao_autor();

-- mensagem: e-mail, id e nome do autor e a data vêm do login (revisão 2b-1, achado 7).
-- A tela já manda exatamente isso (ChatWindow.jsx:64-68, ChatContextual.jsx:117-122):
-- só corrige quem manda outra coisa, sem recusar.
create or replace function public.mensagem_chat_autor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_nome text;
begin
  if current_user = 'authenticated' and auth.uid() is not null then
    if public.current_user_email() is not null then
      new.usuario_email := public.current_user_email();
    end if;
    select l.o_id, l.o_nome into v_id, v_nome from public.chat_meu_login() l;
    if v_id is not null then
      new.usuario_id := v_id;
      new.usuario_nome := coalesce(v_nome, new.usuario_nome);
    end if;
    new.created_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.mensagem_chat_autor() from public, anon;
grant execute on function public.mensagem_chat_autor() to authenticated, service_role;

drop trigger if exists mensagem_chat_autor on public.mensagem_chat;
create trigger mensagem_chat_autor before insert on public.mensagem_chat
  for each row execute function public.mensagem_chat_autor();

-- 4. campos protegidos (uma função por tabela; revisão 2b-1, achados 1 e 5) --------
drop trigger if exists chat_campos_protegidos on public.canal_chat;
drop trigger if exists chat_campos_protegidos on public.mensagem_chat;
drop function if exists public.chat_campos_protegidos();

-- canal: tipo, participantes, autor, empresa, ativo e exclusão lógica só pelo criador
-- ou administrador; nome e "última mensagem" seguem livres para quem vê o canal
-- (ChatWindow.jsx:80, ChatContextual.jsx:128)
create or replace function public.canal_chat_campos_protegidos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' or public.usuario_eh_administrador() then
    return new;
  end if;
  if (new.tipo, new.participantes, new.participantes_emails, new.created_by, new.empresa_id,
      new.ativo, new.deleted_at)
     is distinct from
     (old.tipo, old.participantes, old.participantes_emails, old.created_by, old.empresa_id,
      old.ativo, old.deleted_at)
     and old.created_by is distinct from auth.uid() then
    raise exception 'Acesso negado: só quem criou o canal muda tipo, participantes ou o exclui'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.canal_chat_campos_protegidos() from public, anon;
grant execute on function public.canal_chat_campos_protegidos() to authenticated, service_role;

drop trigger if exists canal_chat_campos_protegidos on public.canal_chat;
create trigger canal_chat_campos_protegidos before update on public.canal_chat
  for each row execute function public.canal_chat_campos_protegidos();

-- mensagem: texto, autor, canal, empresa, anexo, menções, data e exclusão lógica só
-- pelo autor ou administrador; lida_por segue livre (ChatWindow.jsx:50)
create or replace function public.mensagem_chat_campos_protegidos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' or public.usuario_eh_administrador() then
    return new;
  end if;
  if (new.mensagem, new.usuario_email, new.usuario_id, new.usuario_nome, new.canal_id, new.empresa_id,
      new.arquivo_url, new.mencoes, new.created_at, new.deleted_at)
     is distinct from
     (old.mensagem, old.usuario_email, old.usuario_id, old.usuario_nome, old.canal_id, old.empresa_id,
      old.arquivo_url, old.mencoes, old.created_at, old.deleted_at)
     and lower(old.usuario_email) is distinct from public.current_user_email() then
    raise exception 'Acesso negado: só o autor altera ou exclui a mensagem'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.mensagem_chat_campos_protegidos() from public, anon;
grant execute on function public.mensagem_chat_campos_protegidos() to authenticated, service_role;

drop trigger if exists mensagem_chat_campos_protegidos on public.mensagem_chat;
create trigger mensagem_chat_campos_protegidos before update on public.mensagem_chat
  for each row execute function public.mensagem_chat_campos_protegidos();

-- 5. canal_chat ------------------------------------------------------------------
drop policy if exists tenant_isolation on public.canal_chat;

drop policy if exists canal_chat_ler on public.canal_chat;
create policy canal_chat_ler on public.canal_chat
  for select to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.canal_chat_visivel(tipo, participantes, participantes_emails, created_by,
                                  (select public.chat_meus_ids()), (select public.usuario_eh_administrador()))
  );

drop policy if exists canal_chat_criar on public.canal_chat;
create policy canal_chat_criar on public.canal_chat
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists canal_chat_alterar on public.canal_chat;
create policy canal_chat_alterar on public.canal_chat
  for update to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.canal_chat_visivel(tipo, participantes, participantes_emails, created_by,
                                  (select public.chat_meus_ids()), (select public.usuario_eh_administrador()))
  )
  with check (empresa_id = public.current_empresa_id());

drop policy if exists canal_chat_apagar on public.canal_chat;

-- 6. mensagem_chat: só nos canais visíveis --------------------------------------
drop policy if exists tenant_isolation on public.mensagem_chat;

drop policy if exists mensagem_chat_ler on public.mensagem_chat;
create policy mensagem_chat_ler on public.mensagem_chat
  for select to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and exists (select 1 from public.canal_chat c where c.id = mensagem_chat.canal_id)
  );

drop policy if exists mensagem_chat_criar on public.mensagem_chat;
create policy mensagem_chat_criar on public.mensagem_chat
  for insert to authenticated
  with check (
    empresa_id = public.current_empresa_id()
    and exists (select 1 from public.canal_chat c where c.id = mensagem_chat.canal_id)
  );

drop policy if exists mensagem_chat_alterar on public.mensagem_chat;
create policy mensagem_chat_alterar on public.mensagem_chat
  for update to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and exists (select 1 from public.canal_chat c where c.id = mensagem_chat.canal_id)
  )
  with check (
    empresa_id = public.current_empresa_id()
    and exists (select 1 from public.canal_chat c where c.id = mensagem_chat.canal_id)
  );

drop policy if exists mensagem_chat_apagar on public.mensagem_chat;

-- 7. notificacao: só do destinatário (criar segue aberto à empresa) -------------
drop policy if exists tenant_isolation on public.notificacao;

drop policy if exists notificacao_ler on public.notificacao;
create policy notificacao_ler on public.notificacao
  for select to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and (
      lower(usuario_email) = (select public.current_user_email())
      -- achado 5: o criador só enxerga a que acabou de criar (RETURNING da menção)
      or (created_by = (select auth.uid()) and created_at > now() - interval '2 minutes')
    )
  );

drop policy if exists notificacao_criar on public.notificacao;
create policy notificacao_criar on public.notificacao
  for insert to authenticated
  with check (empresa_id = public.current_empresa_id());

drop policy if exists notificacao_alterar on public.notificacao;
create policy notificacao_alterar on public.notificacao
  for update to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and lower(usuario_email) = (select public.current_user_email())
  )
  with check (
    empresa_id = public.current_empresa_id()
    and lower(usuario_email) = (select public.current_user_email())
  );

drop policy if exists notificacao_apagar on public.notificacao;

-- 8. achado 6: sem DELETE físico nem TRUNCATE (o SDK só faz exclusão lógica) ----
revoke delete, truncate on public.canal_chat, public.mensagem_chat, public.notificacao from authenticated;
revoke insert, update, delete, truncate on public.canal_chat, public.mensagem_chat, public.notificacao from anon;

notify pgrst, 'reload schema';

commit;
select 'ok' as res;
