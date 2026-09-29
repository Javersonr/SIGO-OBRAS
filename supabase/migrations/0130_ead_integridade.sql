-- 0130 — EAD (NR-1): andamento e conclusão do treinamento só pelo servidor
--
-- O certificado do Portal do Funcionário é emitido a partir do progresso das
-- aulas, da tentativa aprovada e da matrícula, e as policies "tenant_isolation"
-- (ALL, empresa_id = current_empresa_id()) deixavam a própria empresa gravar
-- tudo isso direto por /rest/v1:
--   - treinamento_progresso: aulas "concluídas" sem ninguém assistir;
--   - treinamento_matricula: status "concluido", início/conclusão, nota,
--     aprovação e validade → certificado de um treinamento que não houve;
--   - treinamento_duvida: dúvida "do funcionário" escrita pela empresa.
-- treinamento_tentativa e treinamento_evento já não tinham policy de escrita,
-- mas o grant seguia aberto (defesa em profundidade).
--
-- O app só faz: TreinamentoMatricula.create({empresa_id, curso_id,
-- funcionario_id, status: "pendente"}), .delete (soft delete: UPDATE de
-- deleted_at), .update({tentativas_extras}) e TreinamentoDuvida.update({resposta,
-- respondida_por, respondida_em}). Progresso, tentativa, evento, andamento da
-- matrícula e a dúvida em si são gravados pela Edge Function portal-funcionario
-- (service role), que também passa a recalcular a conclusão antes de emitir.
--
-- Agora, fora do servidor/super admin:
--   - progresso, tentativa e evento: só leitura;
--   - matrícula: no INSERT o andamento/conclusão nasce no valor inicial; no
--     UPDATE só mudam tentativas_extras e deleted_at (excluir = soft delete do
--     SDK). Sem DELETE de verdade: apagaria em cascata certificado, tentativas
--     e progresso (a trilha de auditoria da NR-1);
--   - dúvida: sem INSERT; no UPDATE só a resposta do tutor.
-- anon não precisa de nada nestas tabelas (o portal passa pela Edge Function).

begin;

-- 1. progresso, tentativa e evento: escrita só pelo servidor ---------------
revoke all on public.treinamento_progresso from anon;
revoke all on public.treinamento_tentativa from anon;
revoke all on public.treinamento_evento from anon;

revoke insert, update, delete, truncate on public.treinamento_progresso from authenticated;
revoke insert, update, delete, truncate on public.treinamento_tentativa from authenticated;
revoke insert, update, delete, truncate on public.treinamento_evento from authenticated;

-- progresso tinha policies ALL (leitura + escrita): viram só leitura, com o
-- mesmo filtro, como já são as de tentativa e evento
drop policy if exists tenant_isolation on public.treinamento_progresso;
drop policy if exists super_admin_all on public.treinamento_progresso;
drop policy if exists tenant_read on public.treinamento_progresso;
drop policy if exists super_admin_read on public.treinamento_progresso;
create policy tenant_read on public.treinamento_progresso for select
  using (empresa_id = public.current_empresa_id());
create policy super_admin_read on public.treinamento_progresso for select
  using (public.current_user_is_super_admin());

-- 2. matrícula: o RH matricula, libera tentativa e exclui -----------------
revoke all on public.treinamento_matricula from anon;
revoke delete, truncate on public.treinamento_matricula from authenticated;

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

drop trigger if exists matricula_andamento_so_servidor on public.treinamento_matricula;
create trigger matricula_andamento_so_servidor
  before insert or update on public.treinamento_matricula
  for each row execute function public.matricula_andamento_so_servidor();

-- 3. dúvida: quem pergunta é o funcionário; a empresa só responde ------------
revoke all on public.treinamento_duvida from anon;
revoke insert, truncate on public.treinamento_duvida from authenticated;

create or replace function public.duvida_so_resposta()
returns trigger
language plpgsql
security definer -- chamador_eh_servidor() não é executável por authenticated (0110)
set search_path = public
as $$
declare
  livres constant text[] := array['resposta', 'respondida_por', 'respondida_em', 'updated_at'];
begin
  if public.chamador_eh_servidor() or public.current_user_is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Acesso negado: a dúvida é enviada pelo funcionário, no Portal do Funcionário'
      using errcode = '42501';
  end if;

  -- apagar a matrícula de vez (FK on delete set null) só zera matricula_id
  if (to_jsonb(new) - livres - 'matricula_id') is distinct from (to_jsonb(old) - livres - 'matricula_id')
     or (new.matricula_id is distinct from old.matricula_id and new.matricula_id is not null) then
    raise exception 'Acesso negado: a dúvida só aceita a resposta do tutor'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.duvida_so_resposta() from public, anon, authenticated;

drop trigger if exists duvida_so_resposta on public.treinamento_duvida;
create trigger duvida_so_resposta
  before insert or update on public.treinamento_duvida
  for each row execute function public.duvida_so_resposta();

commit;
