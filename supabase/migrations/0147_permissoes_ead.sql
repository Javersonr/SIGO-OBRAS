-- 0147 — EAD (T33, FR-12/M2): permissão própria do Portal de Treinamento conferida pelo BANCO, documentos do portal
-- só por RPC e ações do RH sem atalho pela API
--
-- Spec aprovado pelo Javerson em 07/10/2026 (como recomendado): docs/superpowers/specs/2026-10-06-permissoes-ead-design.md
-- (P1 a aba "Treinamentos EAD" com 7 funções; P2 documentos do portal na aba RH; P3 = C1; P4 desativar no cadastro
-- central exige Publicar; P5 gabarito, tentativas e trilha só para quem tem a aba; P6 A1, B2 e S1; P7 = 0147).
--
-- Por quê: a RLS das tabelas do EAD só comparava empresa_id. Qualquer usuário logado da empresa (Compras, Estoque,
-- Financeiro...) fazia pela API, sem abrir a aba: mudar nota mínima, tentativas, RT e "Publicado" do curso (H1); mudar
-- aula, questão e o gabarito (H2); trocar ou apagar o vídeo de uma aula no Storage (H3); reescrever ou despublicar os
-- cursos EAD vinculados editando o cadastro central de treinamentos (H4, a propagação da 0131 roda com as permissões
-- de quem edita); matricular e remover matrícula com certificado válido (H5); somar tentativa extra sem trilha (H6);
-- revogar certificado sem trilha nem aviso (H7); responder dúvida como tutor (H8); ler gabarito, tentativas e a trilha
-- com IP e dispositivo (H9); publicar no portal de um funcionário qualquer arquivo da empresa ou retirar um publicado
-- (H10). E o formulário "Edição completa" do funcionário, salvando a lista velha de documentos_rh_anexos, apagava um
-- PDF publicado no portal depois de o formulário abrir.
--
-- O que muda (desenho S1: função SQL que lê usuario_empresa.permissoes + triggers; a escrita segue pelo SDK):
--
--   1. public.tem_permissao(modulo, aba, funcao): espelho em SQL do temPermissaoServidor
--      (supabase/functions/_shared/conector/acesso.ts). Servidor e super admin passam; sem login, não; o vínculo é o
--      ATIVO (ativo = true, sem deleted_at) do e-mail do token na empresa do token, o mais antigo (o mesmo critério do
--      vinculoDoChamador do funcionario-acesso); Admin e dono passam; senão, as permissões (objeto, texto JSON ou
--      texto JSON duas vezes; inválido = nada). Lida a cada comando, não do token: mudar a permissão em
--      Configurações → Usuários vale na próxima ação. A tabela de casos é a mesma do acesso.test.ts e do smoke.
--
--   2. Trigger zz_permissao_ead (BEFORE INSERT OR UPDATE) nas tabelas do EAD, com a função da aba nova que cada ação
--      exige (UPDATE que não muda nada, fora updated_at, passa):
--        treinamento_curso       INSERT: Editar (e Publicar, se nascer publicado); UPDATE só de ativo: Publicar;
--                                UPDATE de outras colunas: Editar (e Publicar, se ativo também mudou); deleted_at
--                                (excluir): Editar e Publicar
--        treinamento_aula, treinamento_questao: Editar
--        treinamento_matricula   INSERT e UPDATE (remover): Matricular; e remover com certificado não revogado é
--                                recusado (a regra do podeRemoverMatricula, lib/ead-gestao.js, vai ao banco)
--        treinamento_duvida      UPDATE (resposta): Responder dúvidas
--        treinamento_sessao_pratica, treinamento_pratica_participante (T12) e treinamento_declaracao_texto (T35):
--                                Editar. As três tabelas nasceram depois do spec com a "LIMITAÇÃO CONHECIDA (depende
--                                da T33)" no cabeçalho (0143 e 0144). O spec põe as sessões em Editar e reserva uma
--                                função "avaliar_pratica" para o lançamento da presença e do resultado; até ela ser
--                                aprovada, o lançamento também exige Editar (antes era livre para qualquer usuário).
--      O nome começa com zz_ DE PROPÓSITO: o Postgres dispara os triggers BEFORE em ordem alfabética, e este tem de
--      rodar DEPOIS do sincronizar_modelo (0131) e do set_updated_at, para ver a linha como ela vai ser gravada. É o
--      que pega a propagação do cadastro central (A1): editar um treinamento central com curso EAD vinculado exige
--      Treinamentos EAD → Editar, e desativá-lo exige também Publicar (P4). Um trigger futuro nessas tabelas com nome
--      depois de "zz_" poderia mudar a linha depois da conferência (R2): não crie.
--
--   3. Matrícula: tentativas_extras sai do que a empresa muda pela API (só o funcionario-acesso soma, com evento na
--      trilha e a trava de tentativas_extras_vistas, T18). Certificado: fora do servidor e do super admin, nenhum
--      UPDATE (a revogação passa só pelo funcionario-acesso, que grava o evento e avisa o aluno); sai a policy
--      tenant_revogar (0103) e o grant de UPDATE de authenticated.
--
--   4. Leitura: policy RESTRITIVA de SELECT em treinamento_questao (gabarito), treinamento_tentativa (prova com o
--      gabarito, nota, IP, dispositivo) e treinamento_evento (trilha com IP e dispositivo): só quem tem alguma função
--      da aba. Curso, matrícula e certificado continuam abertos à empresa (Ficha e TST leem). O portal, a validação
--      pública e o cron usam service role e não mudam.
--
--   5. Storage, bucket treinamentos: policies RESTRITIVAS de INSERT, UPDATE e DELETE exigem Editar (antes qualquer
--      usuário da empresa trocava ou apagava o vídeo de uma aula). Os nomes não colidem com os que o
--      ensure_tenant_bucket recria. A leitura não muda (o aluno recebe URL assinada do servidor).
--
--   6. Documentos do portal (B2): RPC portal_documento_publicar e portal_documento_retirar (Segurança do Trabalho →
--      RH → Criar / Deletar), que montam e gravam o item num UPDATE só, e o trigger zz_documentos_portal em
--      funcionario, que protege os itens com origem 'portal_funcionario': mudar só esses itens pela API é recusado
--      (42501); o salvamento do formulário inteiro com a lista velha mantém os itens do portal que estão no banco
--      (corrige a perda de dado). Nenhum item existente muda de lugar. O trigger roda como authenticated (não é
--      SECURITY DEFINER, R7) e chama anexos_como_lista e anexos_do_portal: as duas têm EXECUTE para authenticated
--      (funções puras). Sem esse grant, todo INSERT de funcionário e todo UPDATE com documentos_rh_anexos pela API
--      falharia com "permission denied for function" (revisão 1 da T33).
--
-- O que NÃO muda: o portal do aluno (portal-funcionario), a validação pública, o cron da 0138, o cadastro central sem
-- curso EAD vinculado, funcionario como um todo (fora os itens do portal), o bucket assinaturas (R8 do spec).
--
-- Ordem em produção (spec §9; o Javerson roda):
--   1. supabase db query --linked -f tools/conferir-permissoes-ead.sql      (só leitura: quem perderia a aba/acesso)
--   2. se a conferência listar alguém: push só do editor de permissões (a aba nova) e marcar as permissões dessas
--      pessoas; lista vazia (só Admin e dono usam o EAD): a fase 1 vai junto com a 2
--   3. npx supabase@2.118.0 functions deploy funcionario-acesso --project-ref <ref> --no-verify-jwt --use-api
--   4. supabase db query --linked -f supabase/migrations/0147_permissoes_ead.sql
--   5. supabase db query --linked -f tools/smoke-permissoes-ead.sql   (begin ... rollback) LOGO DEPOIS do passo 4 e
--      antes de liberar o uso: ele roda como cada usuário e pega o que a migração quebraria (por exemplo, o cadastro de
--      funcionário). Se FALHAR, desfazer na hora com supabase db query --linked -f tools/desfazer-permissoes-ead.sql
--      (bloco "PARA DESFAZER" abaixo). Erro de ambiente do smoke ("Nenhum funcionário ativo para testar", funcionário
--      de teste com documentos_rh_anexos ilegível) não é falha da migração: não manda desfazer
--   6. push da tela e o roteiro manual do spec (§9)
-- Entre 3 e 6 a tela antiga segue funcionando para Admin e dono; o cartão antigo de documentos recebe o erro claro
-- do item 6 (não perde o PDF em silêncio) até o push. Depois de aplicar, os smokes antigos do EAD (trilha, prática,
-- declaração e pré-requisito) usam um vínculo Admin sintético (atualizados junto com esta migração).
--
-- Idempotente: create or replace nas funções, drop if exists antes de cada trigger e policy, revoke/grant repetíveis.
-- Sem UPDATE, INSERT ou DELETE de dado real.
--
-- PARA DESFAZER (volta ao comportamento de antes, sem mexer em dado): o bloco completo, pronto para rodar, é o arquivo
-- tools/desfazer-permissoes-ead.sql (uma transação só, repetível):
--   supabase db query --linked -f tools/desfazer-permissoes-ead.sql
-- Ele derruba os 8 triggers zz_permissao_ead e o zz_documentos_portal, as 3 policies de leitura e as 3 do Storage e as
-- 9 funções novas, devolve matricula_andamento_so_servidor ao texto da 0130 e certificado_so_revogacao ao da 0119,
-- recria a policy tenant_revogar (0103) e dá UPDATE no certificado a authenticated de volta. Rode antes do push da tela
-- (passo 6): as RPC dos documentos saem junto. O arquivo fica fora deste cabeçalho para ser rodado como está, sem
-- copiar comentário; o teste migracao-0147-desfazer.test.ts mantém os dois alinhados (um objeto novo aqui sem o
-- drop lá acusa).

begin;
set local lock_timeout = '10s';

-- 1. tem_permissao ------------------------------------------------------------------------------------------------

-- permissoes de usuario_empresa como objeto: objeto, texto JSON ou texto JSON duas vezes (o objetoJson do
-- acesso.ts); o que não for objeto vira {}. Nunca lança.
create or replace function public.permissoes_como_objeto(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v jsonb := p;
begin
  for i in 1..2 loop
    exit when v is null or jsonb_typeof(v) <> 'string';
    begin
      v := (v #>> '{}')::jsonb;
    exception when others then
      return '{}'::jsonb;
    end;
  end loop;
  if v is null or jsonb_typeof(v) <> 'object' then
    return '{}'::jsonb;
  end if;
  return v;
end;
$$;
revoke all on function public.permissoes_como_objeto(jsonb) from public, anon, authenticated;

-- Espelho do temPermissaoServidor: só módulo = alguma aba (objeto) com alguma função true; módulo e aba = aba true ou
-- alguma função da aba true; módulo, aba e função = aquela função true. SECURITY DEFINER para ler usuario_empresa e
-- chamar chamador_eh_servidor() (que authenticated não executa); só revela as permissões do próprio chamador.
create or replace function public.tem_permissao(
  p_modulo text,
  p_aba text default null,
  p_funcao text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_perfil text;
  v_dono boolean;
  v_bruto jsonb;
  v_modulo jsonb;
  v_aba jsonb;
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return true;
  end if;
  if auth.uid() is null or coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    return false;
  end if;

  select ue.perfil, ue.is_owner, ue.permissoes
    into v_perfil, v_dono, v_bruto
    from public.usuario_empresa ue
   where lower(ue.usuario_email) = public.current_user_email()
     and ue.empresa_id = public.current_empresa_id()
     and ue.ativo = true
     and ue.deleted_at is null
   order by ue.created_at asc
   limit 1;
  if not found then
    return false;
  end if;
  if v_perfil = 'Admin' or v_dono is true then
    return true;
  end if;

  v_modulo := public.permissoes_como_objeto(v_bruto) -> p_modulo;
  if v_modulo is null or jsonb_typeof(v_modulo) <> 'object' then
    return false;
  end if;

  if p_aba is null and p_funcao is null then
    return exists (
      select 1
        from jsonb_each(v_modulo) a
       where jsonb_typeof(a.value) = 'object'
         and exists (select 1 from jsonb_each(a.value) f where f.value = 'true'::jsonb)
    );
  end if;

  v_aba := case when p_aba is null then null else v_modulo -> p_aba end;
  if p_funcao is null then
    if jsonb_typeof(v_aba) = 'boolean' then
      return v_aba = 'true'::jsonb;
    end if;
    if jsonb_typeof(v_aba) = 'object' then
      return exists (select 1 from jsonb_each(v_aba) f where f.value = 'true'::jsonb);
    end if;
    return false;
  end if;

  if v_aba is null or jsonb_typeof(v_aba) <> 'object' then
    return false;
  end if;
  return coalesce((v_aba -> p_funcao) = 'true'::jsonb, false);
end;
$$;
revoke all on function public.tem_permissao(text, text, text) from public, anon, authenticated;
grant execute on function public.tem_permissao(text, text, text) to authenticated, service_role;

comment on function public.tem_permissao(text, text, text) is
  'T33: o chamador tem a permissão (módulo, aba, função) do editor de permissões? Espelho do temPermissaoServidor (acesso.ts). Servidor, super admin, Admin e dono passam; vínculo ativo do e-mail e da empresa do token.';

-- 2. zz_permissao_ead ----------------------------------------------------------------------------------------------

create or replace function public.zz_permissao_ead()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() e tem_permissao: o mesmo padrão das travas da 0119/0130
set search_path = public
as $$
declare
  v_mudou text[] := '{}';
  v_exige text[] := '{}';
  v_funcao text;
  v_rotulo text;
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return new;
  end if;

  -- as colunas que mudaram de verdade (updated_at não conta); UPDATE que não muda nada passa
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}')
      into v_mudou
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.key <> 'updated_at'
       and n.value is distinct from o.value;
    if cardinality(v_mudou) = 0 then
      return new;
    end if;
  end if;

  if tg_table_name = 'treinamento_curso' then
    if tg_op = 'INSERT' then
      v_exige := array['editar'];
      if (to_jsonb(new) -> 'ativo') = 'true'::jsonb then
        v_exige := v_exige || 'publicar'::text;
      end if;
    elsif 'deleted_at' = any (v_mudou) then
      v_exige := array['editar', 'publicar'];
    else
      if exists (select 1 from unnest(v_mudou) c where c <> 'ativo') then
        v_exige := v_exige || 'editar'::text;
      end if;
      if 'ativo' = any (v_mudou) then
        v_exige := v_exige || 'publicar'::text;
      end if;
    end if;
  elsif tg_table_name = 'treinamento_matricula' then
    v_exige := array['matricular'];
  elsif tg_table_name = 'treinamento_duvida' then
    v_exige := array['responder_duvidas'];
  else
    -- treinamento_aula, treinamento_questao, treinamento_sessao_pratica, treinamento_pratica_participante,
    -- treinamento_declaracao_texto
    v_exige := array['editar'];
  end if;

  foreach v_funcao in array v_exige loop
    if not public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', v_funcao) then
      -- a mudança veio da propagação do cadastro central (0131): o trigger roda dentro do UPDATE de treinamento
      if tg_table_name = 'treinamento_curso' and pg_trigger_depth() > 1 then
        raise exception 'Este treinamento do cadastro central tem curso EAD vinculado. Alterar nome, código, carga, validade ou conteúdo exige Treinamentos EAD → Editar; desativar exige também Publicar.'
          using errcode = '42501';
      end if;
      v_rotulo := case v_funcao
        when 'editar' then 'Editar'
        when 'publicar' then 'Publicar'
        when 'matricular' then 'Matricular'
        when 'responder_duvidas' then 'Responder dúvidas'
        else v_funcao end;
      raise exception 'Sem permissão: Segurança do Trabalho → Treinamentos EAD → %', v_rotulo
        using errcode = '42501';
    end if;
  end loop;

  -- remover matrícula com certificado emitido e não revogado: o certificado continuaria válido na consulta
  -- pública sem ninguém para revogá-lo (T20). Antes a trava era só da tela. (Os campos vêm por to_jsonb: a mesma
  -- função serve tabelas sem deleted_at.)
  if tg_table_name = 'treinamento_matricula' and tg_op = 'UPDATE' then
    if (to_jsonb(old) ->> 'deleted_at') is null
       and (to_jsonb(new) ->> 'deleted_at') is not null
       and exists (
         select 1 from public.treinamento_certificado c
          where c.matricula_id = (to_jsonb(new) ->> 'id')::uuid and c.revogado_em is null
       ) then
      raise exception 'Esta matrícula tem certificado emitido e ainda válido. Revogue o certificado antes de remover a matrícula (Detalhes da matrícula → Revogar).'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.zz_permissao_ead() from public, anon, authenticated;

drop trigger if exists zz_permissao_ead on public.treinamento_curso;
create trigger zz_permissao_ead
  before insert or update on public.treinamento_curso
  for each row execute function public.zz_permissao_ead();

drop trigger if exists zz_permissao_ead on public.treinamento_aula;
create trigger zz_permissao_ead
  before insert or update on public.treinamento_aula
  for each row execute function public.zz_permissao_ead();

drop trigger if exists zz_permissao_ead on public.treinamento_questao;
create trigger zz_permissao_ead
  before insert or update on public.treinamento_questao
  for each row execute function public.zz_permissao_ead();

drop trigger if exists zz_permissao_ead on public.treinamento_matricula;
create trigger zz_permissao_ead
  before insert or update on public.treinamento_matricula
  for each row execute function public.zz_permissao_ead();

drop trigger if exists zz_permissao_ead on public.treinamento_duvida;
create trigger zz_permissao_ead
  before insert or update on public.treinamento_duvida
  for each row execute function public.zz_permissao_ead();

drop trigger if exists zz_permissao_ead on public.treinamento_sessao_pratica;
create trigger zz_permissao_ead
  before insert or update on public.treinamento_sessao_pratica
  for each row execute function public.zz_permissao_ead();

drop trigger if exists zz_permissao_ead on public.treinamento_pratica_participante;
create trigger zz_permissao_ead
  before insert or update on public.treinamento_pratica_participante
  for each row execute function public.zz_permissao_ead();

-- a versão do texto é só de inclusão (0144: UPDATE barrado pela trilha_imutavel); aqui só o INSERT
drop trigger if exists zz_permissao_ead on public.treinamento_declaracao_texto;
create trigger zz_permissao_ead
  before insert on public.treinamento_declaracao_texto
  for each row execute function public.zz_permissao_ead();

-- 3. matrícula e certificado: o que sobrou de escrita pela API ----------------------------------------------------

-- igual à 0130, sem tentativas_extras entre as colunas livres (só o funcionario-acesso soma, com trilha)
create or replace function public.matricula_andamento_so_servidor()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() não é executável por authenticated (0110)
set search_path = public
as $$
declare
  -- o que a empresa pode mudar numa matrícula existente: só excluir (deleted_at, soft delete do SDK)
  livres constant text[] := array['deleted_at', 'updated_at'];
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
    raise exception 'Acesso negado: andamento e conclusão do treinamento só pelo Portal do Funcionário; tentativa extra só pelo botão Liberar tentativa (Detalhes da matrícula)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function public.matricula_andamento_so_servidor() from public, anon, authenticated;

-- fora do servidor e do super admin, nenhum UPDATE: a revogação é do funcionario-acesso (trilha + aviso ao aluno)
create or replace function public.certificado_so_revogacao()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() não é executável por authenticated (0110)
set search_path = public
as $$
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return new;
  end if;
  raise exception 'Acesso negado: o certificado emitido só é revogado pelo servidor (Detalhes da matrícula → Revogar), que registra a revogação na trilha e avisa o aluno'
    using errcode = '42501';
end;
$$;
revoke all on function public.certificado_so_revogacao() from public, anon, authenticated;

drop policy if exists tenant_revogar on public.treinamento_certificado;
revoke update on public.treinamento_certificado from authenticated;

-- 4. leitura do gabarito, das tentativas e da trilha (P5) ---------------------------------------------------------
-- RESTRITIVA: soma-se às policies que existem (empresa_id). O (select ...) calcula uma vez por consulta.
drop policy if exists ead_leitura_com_permissao on public.treinamento_questao;
create policy ead_leitura_com_permissao on public.treinamento_questao
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')));

drop policy if exists ead_leitura_com_permissao on public.treinamento_tentativa;
create policy ead_leitura_com_permissao on public.treinamento_tentativa
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')));

drop policy if exists ead_leitura_com_permissao on public.treinamento_evento;
create policy ead_leitura_com_permissao on public.treinamento_evento
  as restrictive for select to authenticated
  using ((select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD')));

-- 5. arquivos das aulas (bucket treinamentos) --------------------------------------------------------------------
-- RESTRITIVAS e valem para todos os buckets: a 1ª condição resolve os outros sem custo (R5).
drop policy if exists treinamentos_insert_com_permissao on storage.objects;
create policy treinamentos_insert_com_permissao on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'treinamentos'
    or (select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar'))
  );

drop policy if exists treinamentos_update_com_permissao on storage.objects;
create policy treinamentos_update_com_permissao on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'treinamentos'
    or (select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar'))
  )
  with check (
    bucket_id <> 'treinamentos'
    or (select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar'))
  );

drop policy if exists treinamentos_delete_com_permissao on storage.objects;
create policy treinamentos_delete_com_permissao on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'treinamentos'
    or (select public.tem_permissao('Segurança do Trabalho', 'Treinamentos EAD', 'editar'))
  );

-- 6. documentos do portal (B2) -------------------------------------------------------------------------------------

-- documentos_rh_anexos como lista, ou NULL quando o valor não é lista nem texto de lista (não dá para gravar por cima
-- sem perder o que está lá). Nunca lança.
create or replace function public.anexos_como_lista(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v jsonb;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p) = 'array' then
    return p;
  end if;
  if jsonb_typeof(p) = 'string' then
    begin
      v := (p #>> '{}')::jsonb;
    exception when others then
      return null;
    end;
    if v is null or jsonb_typeof(v) = 'null' then
      return '[]'::jsonb;
    end if;
    if jsonb_typeof(v) = 'array' then
      return v;
    end if;
  end if;
  return null;
end;
$$;
-- EXECUTE para authenticated DE PROPÓSITO: o trigger zz_documentos_portal (mais abaixo) NÃO é SECURITY DEFINER (R7: ele
-- precisa do current_user) e roda como authenticated em todo INSERT de funcionário e em todo UPDATE que leva
-- documentos_rh_anexos. O Postgres confere o EXECUTE da chamada aninhada com esse papel: sem o grant, o cadastro, a
-- contratação, a importação e a Edição completa do RH falham com "permission denied for function". São funções
-- puras (só leem o jsonb que o próprio chamador grava), sem dado de empresa; anon continua sem acesso.
revoke all on function public.anexos_como_lista(jsonb) from public, anon, authenticated;
grant execute on function public.anexos_como_lista(jsonb) to authenticated;

-- os itens publicados no portal (origem = portal_funcionario) ou os outros, na ordem da lista
create or replace function public.anexos_do_portal(p jsonb, p_do_portal boolean)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(e.value order by e.ordem), '[]'::jsonb)
    from jsonb_array_elements(coalesce(public.anexos_como_lista(p), '[]'::jsonb))
         with ordinality as e(value, ordem)
   where (((e.value ->> 'origem') = 'portal_funcionario') is true) = p_do_portal;
$$;
-- (mesmo motivo do grant acima: o zz_documentos_portal chama esta função como authenticated, e ela chama a anterior)
revoke all on function public.anexos_do_portal(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.anexos_do_portal(jsonb, boolean) to authenticated;

-- funcionário vivo da empresa do chamador (ou qualquer um, para o servidor e o super admin), travado para o UPDATE
create or replace function public.portal_documento_funcionario(p_funcionario_id uuid)
returns public.funcionario
language plpgsql
security definer
set search_path = public
as $$
declare
  v_func public.funcionario;
begin
  select * into v_func
    from public.funcionario f
   where f.id = p_funcionario_id and f.deleted_at is null
   for update;
  if not found then
    raise exception 'Funcionário não encontrado' using errcode = 'P0002';
  end if;
  perform public.exigir_empresa_do_chamador(v_func.empresa_id, 'funcionário');
  return v_func;
end;
$$;
revoke all on function public.portal_documento_funcionario(uuid) from public, anon, authenticated;

create or replace function public.portal_documento_publicar(
  p_funcionario_id uuid,
  p_tipo text,
  p_competencia text,
  p_ref text,
  p_nome_arquivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_func public.funcionario;
  v_lista jsonb;
  v_prefixo text;
  v_caminho text;
  v_nome text := btrim(coalesce(p_nome_arquivo, ''));
  v_competencia text;
  v_item jsonb;
begin
  -- a permissão antes de qualquer leitura; a empresa do funcionário é conferida em portal_documento_funcionario
  if not public.tem_permissao('Segurança do Trabalho', 'RH', 'criar') then
    raise exception 'Sem permissão: Segurança do Trabalho → RH → Criar (publicar PDF no portal)'
      using errcode = '42501';
  end if;
  v_func := public.portal_documento_funcionario(p_funcionario_id);

  if p_tipo is null or p_tipo not in ('documentacao', 'contracheque', 'folha_ponto') then
    raise exception 'Escolha o tipo do documento' using errcode = '22023';
  end if;
  if p_tipo = 'documentacao' then
    v_competencia := null;
  elsif coalesce(p_competencia, '') ~ '^\d{4}-(0[1-9]|1[0-2])$' then
    v_competencia := p_competencia;
  else
    raise exception 'Informe a competência (mês e ano)' using errcode = '22023';
  end if;
  if v_nome = '' or char_length(v_nome) > 255 then
    raise exception 'Nome do arquivo inválido' using errcode = '22023';
  end if;

  -- o arquivo: um PDF já enviado ao bucket contratacao, na pasta da empresa do funcionário, fora de recibos/
  v_prefixo := 'contratacao/' || v_func.empresa_id::text || '/';
  if p_ref is null
     or left(p_ref, char_length(v_prefixo)) <> v_prefixo
     or position('//' in p_ref) > 0
     or exists (
       select 1 from unnest(string_to_array(p_ref, '/')) s where s in ('', '.', '..')
     ) then
    raise exception 'O arquivo precisa estar na pasta da empresa do funcionário' using errcode = '22023';
  end if;
  v_caminho := substr(p_ref, char_length('contratacao/') + 1);
  if split_part(v_caminho, '/', 2) = 'recibos' then
    raise exception 'Este arquivo não pode ir para o portal' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'contratacao'
       and o.name = v_caminho
       and o.metadata ->> 'mimetype' = 'application/pdf'
  ) then
    raise exception 'O PDF enviado não foi encontrado: envie o arquivo de novo' using errcode = '22023';
  end if;

  v_lista := public.anexos_como_lista(v_func.documentos_rh_anexos);
  if v_lista is null then
    raise exception 'A lista de documentos do RH deste funcionário está num formato que não dá para ler: corrija o cadastro antes de publicar'
      using errcode = '22023';
  end if;

  v_item := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'origem', 'portal_funcionario',
    'funcionario_id', v_func.id::text,
    'publicado', true,
    'tipo', p_tipo,
    'competencia', v_competencia,
    'nome_arquivo', v_nome,
    'url', p_ref,
    'data_upload', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'publicado_por', public.current_user_email()
  );
  update public.funcionario
     set documentos_rh_anexos = v_lista || jsonb_build_array(v_item)
   where id = v_func.id and empresa_id = v_func.empresa_id;
  return v_item;
end;
$$;
revoke all on function public.portal_documento_publicar(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.portal_documento_publicar(uuid, text, text, text, text)
  to authenticated, service_role;

create or replace function public.portal_documento_retirar(p_funcionario_id uuid, p_documento_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_func public.funcionario;
  v_lista jsonb;
  v_nova jsonb;
begin
  if not public.tem_permissao('Segurança do Trabalho', 'RH', 'deletar') then
    raise exception 'Sem permissão: Segurança do Trabalho → RH → Deletar (retirar PDF do portal)'
      using errcode = '42501';
  end if;
  v_func := public.portal_documento_funcionario(p_funcionario_id);

  v_lista := public.anexos_como_lista(v_func.documentos_rh_anexos);
  if v_lista is null then
    raise exception 'A lista de documentos do RH deste funcionário está num formato que não dá para ler: corrija o cadastro antes de retirar'
      using errcode = '22023';
  end if;
  -- só o item do portal DESTE funcionário com o id pedido; o resto (inclusive o que não é objeto) fica
  select coalesce(jsonb_agg(e.value order by e.ordem), '[]'::jsonb)
    into v_nova
    from jsonb_array_elements(v_lista) with ordinality as e(value, ordem)
   where ((e.value ->> 'origem') = 'portal_funcionario'
          and (e.value ->> 'id') = p_documento_id
          and (e.value ->> 'funcionario_id') = v_func.id::text) is not true;
  if jsonb_array_length(v_nova) = jsonb_array_length(v_lista) then
    return false; -- já tinha saído (outro RH retirou antes)
  end if;
  update public.funcionario
     set documentos_rh_anexos = v_nova
   where id = v_func.id and empresa_id = v_func.empresa_id;
  return true;
end;
$$;
revoke all on function public.portal_documento_retirar(uuid, text) from public, anon, authenticated;
grant execute on function public.portal_documento_retirar(uuid, text) to authenticated, service_role;

-- Protege os itens do portal em documentos_rh_anexos. NÃO é SECURITY DEFINER de propósito (R7): o current_user é
-- quem grava. "authenticated" é a API (tela ou chamada direta); service_role, o dono do banco e as RPC acima (que são
-- SECURITY DEFINER do dono) passam. Não depende de variável de sessão que alguém possa esquecer de ligar.
-- Como roda COM os direitos de authenticated, as funções auxiliares que ela chama (anexos_como_lista e
-- anexos_do_portal) precisam de EXECUTE para authenticated (grant acima). Não troque isto por SECURITY DEFINER sem
-- rever a R7, e não tire o grant sem testar o INSERT de funcionário (tools/smoke-permissoes-ead.sql, passo 13).
create or replace function public.zz_documentos_portal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_portal_antes jsonb;
  v_portal_depois jsonb;
begin
  if current_user::text <> 'authenticated' then
    return new;
  end if;

  v_portal_depois := public.anexos_do_portal(new.documentos_rh_anexos, true);
  if tg_op = 'INSERT' then
    if jsonb_array_length(v_portal_depois) > 0 then
      raise exception 'Publique o PDF pelo cartão "PDFs do Portal do Funcionário" da Ficha do funcionário'
        using errcode = '42501';
    end if;
    return new;
  end if;

  v_portal_antes := public.anexos_do_portal(old.documentos_rh_anexos, true);
  if v_portal_depois = v_portal_antes then
    return new;
  end if;

  -- só os itens do portal mudaram (nada mais na linha, nem os outros anexos): é a chamada direta à API, ou o
  -- cartão antigo entre a migração e o push. Recusar não perde dado.
  if (to_jsonb(new) - 'documentos_rh_anexos' - 'updated_at') = (to_jsonb(old) - 'documentos_rh_anexos' - 'updated_at')
     and public.anexos_do_portal(new.documentos_rh_anexos, false)
         = public.anexos_do_portal(old.documentos_rh_anexos, false) then
    raise exception 'Publique ou retire o PDF pelo cartão "PDFs do Portal do Funcionário" da Ficha do funcionário'
      using errcode = '42501';
  end if;

  -- mudou mais alguma coisa (o salvamento do formulário inteiro com a lista velha): grava o resto e mantém os itens
  -- do portal que estão no banco
  new.documentos_rh_anexos := public.anexos_do_portal(new.documentos_rh_anexos, false) || v_portal_antes;
  return new;
end;
$$;
revoke all on function public.zz_documentos_portal() from public, anon, authenticated;

drop trigger if exists zz_documentos_portal on public.funcionario;
create trigger zz_documentos_portal
  before insert or update of documentos_rh_anexos on public.funcionario
  for each row execute function public.zz_documentos_portal();

commit;

-- Conferência (só leitura): o que esta migração deixou no banco. Esperado: tem_permissao = 1, triggers_zz_de_8 = 8,
-- leitura_restritiva_de_3 = 3, storage_restritivas_de_3 = 3, tenant_revogar = 0, certificado_update_authenticated =
-- false, rpc_documentos_de_2 = 2, trigger_documentos = 1, anexos_executaveis_pela_api = true (o trigger chama as duas
-- como authenticated), anexos_fechados_ao_anon = true.
select (select count(*) from pg_proc
         where pronamespace = 'public'::regnamespace and proname = 'tem_permissao') as tem_permissao,
       (select count(*) from pg_trigger where not tgisinternal and tgname = 'zz_permissao_ead') as triggers_zz_de_8,
       (select count(*) from pg_policies
         where schemaname = 'public' and policyname = 'ead_leitura_com_permissao'
           and permissive = 'RESTRICTIVE') as leitura_restritiva_de_3,
       (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'treinamentos\_%\_com\_permissao' and permissive = 'RESTRICTIVE')
         as storage_restritivas_de_3,
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'treinamento_certificado'
           and policyname = 'tenant_revogar') as tenant_revogar,
       has_table_privilege('authenticated', 'public.treinamento_certificado', 'UPDATE')
         as certificado_update_authenticated,
       (select count(*) from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('portal_documento_publicar', 'portal_documento_retirar')) as rpc_documentos_de_2,
       (select count(*) from pg_trigger where not tgisinternal and tgname = 'zz_documentos_portal')
         as trigger_documentos,
       (has_function_privilege('authenticated', 'public.anexos_como_lista(jsonb)', 'execute')
         and has_function_privilege('authenticated', 'public.anexos_do_portal(jsonb, boolean)', 'execute'))
         as anexos_executaveis_pela_api,
       (not has_function_privilege('anon', 'public.anexos_como_lista(jsonb)', 'execute')
         and not has_function_privilege('anon', 'public.anexos_do_portal(jsonb, boolean)', 'execute'))
         as anexos_fechados_ao_anon;

select 'ok' as res;
